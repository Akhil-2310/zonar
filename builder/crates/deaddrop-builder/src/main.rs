//! Dead Drop's transaction builder.
//!
//! Each player agent is a view-only wallet here (its UFVK, never its seed). For every
//! sealed move the game server asks for a PCZT paying a zero-value note with the move's
//! memo to the match vault. The unproven PCZT goes to the player's browser to be checked
//! and signed while this service proves a copy; the two are combined and broadcast.
//!
//! Listens on 127.0.0.1 only: the game server is its sole client.
//!
//!   POST /accounts                  { id, ufvk, seed_fingerprint, account_index }
//!   POST /accounts/{id}/addresses   { count }              -> { addresses }
//!   GET  /accounts/{id}/balance                            -> { spendable_zats, total_zats, pending_zats, chain_tip }
//!   POST /accounts/{id}/build       { to, memo }           -> { build_id, pczt }
//!   POST /builds/{id}/submit        { signed }             -> { txid }
//!   POST /builds/{id}/cancel

use std::{collections::HashMap, path::PathBuf, sync::Arc, time::Duration};

use anyhow::{Context, anyhow};
use axum::{
    Json, Router,
    extract::{Path, State},
    http::StatusCode,
    response::{IntoResponse, Response},
    routing::{get, post},
};
use base64::{Engine, engine::general_purpose::STANDARD as B64};
use serde::Deserialize;
use serde_json::{Value, json};
use tokio::sync::Mutex;
use tracing::{info, warn};
use zebfin_wallet::{
    Recipient, Wallet, combine, connect, parse_pczt, prove, serialize_pczt,
    zcash_client_backend::proto::service::compact_tx_streamer_client::CompactTxStreamerClient,
};

type Client = CompactTxStreamerClient<tonic::transport::Channel>;

struct Build {
    account: String,
    lock_owner: [u8; 32],
    proven: tokio::task::JoinHandle<anyhow::Result<Vec<u8>>>,
}

struct App {
    dir: PathBuf,
    client: Client,
    wallets: Mutex<HashMap<String, Arc<Mutex<Wallet>>>>,
    builds: Mutex<HashMap<String, Build>>,
}

struct ApiError(anyhow::Error);
impl<E: Into<anyhow::Error>> From<E> for ApiError {
    fn from(e: E) -> Self {
        Self(e.into())
    }
}
impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        (StatusCode::BAD_REQUEST, Json(json!({ "error": format!("{:#}", self.0) }))).into_response()
    }
}
type ApiResult = Result<Json<Value>, ApiError>;

// Agent ids become directory names, so keep them to a safe alphabet.
fn valid_id(id: &str) -> anyhow::Result<()> {
    if id.is_empty() || id.len() > 64 || !id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-') {
        return Err(anyhow!("invalid account id"));
    }
    Ok(())
}

impl App {
    async fn wallet(&self, id: &str) -> anyhow::Result<Arc<Mutex<Wallet>>> {
        valid_id(id)?;
        self.wallets
            .lock()
            .await
            .get(id)
            .cloned()
            .ok_or_else(|| anyhow!("unknown account {id}"))
    }
}

#[derive(Deserialize)]
struct NewAccount {
    id: String,
    ufvk: String,
    seed_fingerprint: String,
    account_index: u32,
}

async fn create_account(State(app): State<Arc<App>>, Json(req): Json<NewAccount>) -> ApiResult {
    valid_id(&req.id)?;
    let mut wallets = app.wallets.lock().await;
    if wallets.contains_key(&req.id) {
        return Ok(Json(json!({ "ok": true, "existing": true })));
    }
    let mut wallet = Wallet::open(&app.dir.join(&req.id))?;
    let mut client = app.client.clone();
    wallet
        .import_account(&mut client, &req.id, &req.ufvk, &req.seed_fingerprint, req.account_index, None)
        .await?;
    wallets.insert(req.id.clone(), Arc::new(Mutex::new(wallet)));
    info!("imported agent {}", req.id);
    Ok(Json(json!({ "ok": true })))
}

#[derive(Deserialize)]
struct Count {
    count: usize,
}

async fn addresses(State(app): State<Arc<App>>, Path(id): Path<String>, Json(req): Json<Count>) -> ApiResult {
    let wallet = app.wallet(&id).await?;
    let mut w = wallet.lock().await;
    let addresses = (0..req.count.clamp(1, 50)).map(|_| w.fresh_address()).collect::<anyhow::Result<Vec<_>>>()?;
    Ok(Json(json!({ "addresses": addresses })))
}

async fn balance(State(app): State<Arc<App>>, Path(id): Path<String>) -> ApiResult {
    let wallet = app.wallet(&id).await?;
    let mut w = wallet.lock().await;
    w.sync(&mut app.client.clone()).await?;
    let b = w.balance()?;
    Ok(Json(json!({
        "spendable_zats": b.orchard_spendable_zats + b.ironwood_spendable_zats,
        "total_zats": b.total_zats,
        "pending_zats": b.pending_zats,
        "chain_tip": b.chain_tip,
    })))
}

#[derive(Deserialize)]
struct BuildReq {
    to: String,
    memo: String,
}

async fn build(State(app): State<Arc<App>>, Path(id): Path<String>, Json(req): Json<BuildReq>) -> ApiResult {
    let wallet = app.wallet(&id).await?;
    let lock_owner: [u8; 32] = rand::random();
    let pczt = {
        let mut w = wallet.lock().await;
        w.sync(&mut app.client.clone()).await?;
        let recipients = [Recipient { address: req.to, value_zats: 0, memo: Some(req.memo) }];
        serialize_pczt(w.create_pczt(&recipients, None, lock_owner)?)?
    };
    // Prove a copy while the player's browser signs the original.
    let to_prove = pczt.clone();
    let proven = tokio::task::spawn_blocking(move || serialize_pczt(prove(parse_pczt(&to_prove)?)?));
    let build_id = hex::encode(rand::random::<[u8; 16]>());
    app.builds.lock().await.insert(build_id.clone(), Build { account: id, lock_owner, proven });
    Ok(Json(json!({ "build_id": build_id, "pczt": B64.encode(&pczt) })))
}

#[derive(Deserialize)]
struct Signed {
    signed: String,
}

async fn submit(State(app): State<Arc<App>>, Path(build_id): Path<String>, Json(req): Json<Signed>) -> ApiResult {
    let build = app.builds.lock().await.remove(&build_id).ok_or_else(|| anyhow!("unknown or already used build"))?;
    let wallet = app.wallet(&build.account).await?;
    let result: anyhow::Result<String> = async {
        let proven = build.proven.await.context("prover task failed")??;
        let signed = B64.decode(req.signed.trim()).context("signed PCZT is not base64")?;
        let pczt = combine(parse_pczt(&proven)?, parse_pczt(&signed)?)?;
        let mut w = wallet.lock().await;
        w.send(&mut app.client.clone(), pczt).await
    }
    .await;
    match result {
        Ok(txid) => {
            info!("agent {} broadcast {txid}", build.account);
            Ok(Json(json!({ "txid": txid })))
        }
        Err(e) => {
            // Free the notes so the player can rebuild and try again.
            let _ = wallet.lock().await.release_locks(build.lock_owner);
            Err(e.into())
        }
    }
}

async fn cancel(State(app): State<Arc<App>>, Path(build_id): Path<String>) -> ApiResult {
    if let Some(build) = app.builds.lock().await.remove(&build_id) {
        build.proven.abort();
        if let Ok(wallet) = app.wallet(&build.account).await {
            wallet.lock().await.release_locks(build.lock_owner)?;
        }
    }
    Ok(Json(json!({ "ok": true })))
}

// Keep every agent's wallet close to the tip so building a move doesn't wait on a long scan.
async fn sync_loop(app: Arc<App>) {
    loop {
        tokio::time::sleep(Duration::from_secs(30)).await;
        let wallets: Vec<_> = app.wallets.lock().await.iter().map(|(k, v)| (k.clone(), v.clone())).collect();
        for (id, wallet) in wallets {
            if let Err(e) = wallet.lock().await.sync(&mut app.client.clone()).await {
                warn!("sync {id}: {e:#}");
            }
        }
    }
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt().with_env_filter(std::env::var("RUST_LOG").unwrap_or_else(|_| "info".into())).init();
    let dir = PathBuf::from(std::env::var("BUILDER_DIR").unwrap_or_else(|_| ".wallets/agents".into()));
    let server = std::env::var("BUILDER_LIGHTWALLETD").unwrap_or_else(|_| zebfin_wallet::DEFAULT_SERVER.into());
    let port: u16 = std::env::var("BUILDER_PORT").ok().and_then(|p| p.parse().ok()).unwrap_or(7071);
    std::fs::create_dir_all(&dir)?;

    let client = connect(&server).await?;
    let mut wallets = HashMap::new();
    for entry in std::fs::read_dir(&dir)? {
        let entry = entry?;
        let id = entry.file_name().to_string_lossy().to_string();
        if entry.file_type()?.is_dir() && valid_id(&id).is_ok() {
            match Wallet::open(&entry.path()) {
                Ok(w) if w.account().is_ok() => {
                    wallets.insert(id, Arc::new(Mutex::new(w)));
                }
                Ok(_) => warn!("{id}: no account, skipping"),
                Err(e) => warn!("{id}: {e:#}"),
            }
        }
    }
    info!("loaded {} agent wallet(s) from {}", wallets.len(), dir.display());

    let app = Arc::new(App { dir, client, wallets: Mutex::new(wallets), builds: Mutex::new(HashMap::new()) });
    tokio::spawn(sync_loop(app.clone()));
    let router = Router::new()
        .route("/health", get(|| async { Json(json!({ "ok": true })) }))
        .route("/accounts", post(create_account))
        .route("/accounts/{id}/addresses", post(addresses))
        .route("/accounts/{id}/balance", get(balance))
        .route("/accounts/{id}/build", post(build))
        .route("/builds/{id}/submit", post(submit))
        .route("/builds/{id}/cancel", post(cancel))
        .with_state(app);
    let listener = tokio::net::TcpListener::bind(("127.0.0.1", port)).await?;
    info!("deaddrop-builder listening on 127.0.0.1:{port} (lightwalletd {server})");
    axum::serve(listener, router).await?;
    Ok(())
}
