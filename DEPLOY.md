# Deploying Zonar on AWS

One EC2 server runs everything: the game, the zingo wallets and the transaction builder.
CloudFront sits in front of it and gives it a free HTTPS address like `https://d1abc23xyz.cloudfront.net`.
That address is what you share with players, and passkeys work on it.

```
Players ──HTTPS──▶ CloudFront (d1abc….cloudfront.net) ──HTTP:80 + X-Origin-Secret──▶ EC2 t3.medium
                                                                                     ├─ Docker: Zonar
                                                                                     └─ ~/zonar/.wallets  ~/zonar/.data
```

- **Only CloudFront can reach the server.** Its security group allows port 80 only from AWS's
  managed CloudFront prefix list, and the server also refuses requests without the `X-Origin-Secret`
  header. So nobody can skip CloudFront to fake their address and dodge the prize limits.
- **Cost:** about $35/month (t3.medium, 30 GB gp3 disk, an Elastic IP). CloudFront is free at this scale.

> **Pick your address once.** Passkey wallets are tied to the site's address. If you later move to a
> different address (your own domain on the same CloudFront distribution, say), players have to create new
> agents. Their funds are safe if they saved their seed phrase.

The live deployment was made with the AWS CLI exactly as below (region `ap-south-1`). Every step can
also be done in the AWS console.

---

## 1. Key pair and security group

```bash
export AWS_REGION=ap-south-1
aws ec2 create-key-pair --key-name zonar --key-type ed25519 --query KeyMaterial --output text > ~/.ssh/zonar.pem
chmod 400 ~/.ssh/zonar.pem

VPC=$(aws ec2 describe-vpcs --filters Name=isDefault,Values=true --query 'Vpcs[0].VpcId' --output text)
SG=$(aws ec2 create-security-group --group-name zonar --description "Zonar: SSH from admin, HTTP from CloudFront only" \
  --vpc-id $VPC --query GroupId --output text)
CF_LIST=$(aws ec2 describe-managed-prefix-lists \
  --filters Name=prefix-list-name,Values=com.amazonaws.global.cloudfront.origin-facing --query 'PrefixLists[0].PrefixListId' --output text)
aws ec2 authorize-security-group-ingress --group-id $SG \
  --ip-permissions "IpProtocol=tcp,FromPort=80,ToPort=80,PrefixListIds=[{PrefixListId=$CF_LIST}]"
aws ec2 authorize-security-group-ingress --group-id $SG --protocol tcp --port 22 --cidr "$(curl -s https://checkip.amazonaws.com)/32"
```

## 2. The server

A boot script clones this repo, writes `.env` with a fresh origin secret and runs `deploy/setup.sh`
(swap, Docker, build, start). The first build takes about 20 minutes.

```bash
SECRET=$(openssl rand -hex 24)        # keep this: CloudFront needs it in step 3
AMI=$(aws ssm get-parameter --name /aws/service/canonical/ubuntu/server/24.04/stable/current/amd64/hvm/ebs-gp3/ami-id \
  --query Parameter.Value --output text)
cat > /tmp/zonar-boot.sh <<EOF
#!/bin/bash
set -e
sudo -u ubuntu git clone https://github.com/Akhil-2310/zonar.git /home/ubuntu/zonar
cd /home/ubuntu/zonar
printf 'COMPOSE_FILE=docker-compose.prod.yml\nORIGIN_SECRET=$SECRET\n' > .env
chown ubuntu:ubuntu .env && chmod 600 .env
SUDO_USER=ubuntu bash deploy/setup.sh
EOF
ID=$(aws ec2 run-instances --image-id $AMI --instance-type t3.medium --key-name zonar --security-group-ids $SG \
  --block-device-mappings 'DeviceName=/dev/sda1,Ebs={VolumeSize=30,VolumeType=gp3,DeleteOnTermination=false}' \
  --user-data file:///tmp/zonar-boot.sh --tag-specifications 'ResourceType=instance,Tags=[{Key=Name,Value=zonar}]' \
  --query 'Instances[0].InstanceId' --output text)
aws ec2 wait instance-running --instance-ids $ID

ALLOC=$(aws ec2 allocate-address --query AllocationId --output text)
aws ec2 associate-address --instance-id $ID --allocation-id $ALLOC
DNS=$(aws ec2 describe-instances --instance-ids $ID --query 'Reservations[0].Instances[0].PublicDnsName' --output text)
```

The disk is kept if the instance is ever terminated (`DeleteOnTermination=false`), because it holds the wallets.

## 3. CloudFront

```bash
cat > /tmp/zonar-cf.json <<EOF
{
  "CallerReference": "zonar-$(date +%s)",
  "Comment": "Zonar",
  "Enabled": true,
  "PriceClass": "PriceClass_200",
  "HttpVersion": "http2",
  "Origins": { "Quantity": 1, "Items": [{
    "Id": "zonar-ec2", "DomainName": "$DNS",
    "CustomOriginConfig": { "HTTPPort": 80, "HTTPSPort": 443, "OriginProtocolPolicy": "http-only",
      "OriginReadTimeout": 60, "OriginKeepaliveTimeout": 60,
      "OriginSslProtocols": { "Quantity": 1, "Items": ["TLSv1.2"] } },
    "CustomHeaders": { "Quantity": 1, "Items": [{ "HeaderName": "X-Origin-Secret", "HeaderValue": "$SECRET" }] }
  }]},
  "DefaultCacheBehavior": {
    "TargetOriginId": "zonar-ec2",
    "ViewerProtocolPolicy": "redirect-to-https",
    "AllowedMethods": { "Quantity": 7, "Items": ["GET","HEAD","OPTIONS","PUT","PATCH","POST","DELETE"],
      "CachedMethods": { "Quantity": 2, "Items": ["GET","HEAD"] } },
    "CachePolicyId": "4135ea2d-6df8-44a3-9df3-4b5a84be39ad",
    "OriginRequestPolicyId": "b689b0a8-53d0-40ab-baf2-68738e2966ac",
    "Compress": false
  }
}
EOF
aws cloudfront create-distribution --distribution-config file:///tmp/zonar-cf.json \
  --query 'Distribution.{id:Id,domain:DomainName}'
```

- `4135ea2d…` is the managed **CachingDisabled** policy: moves and the live match stream always reach the server.
- `b689b0a8…` is the managed **AllViewerExceptHostHeader** policy: query strings and headers are passed through.

The distribution takes about 10 minutes to deploy. Then `https://<domain>` is the game.

## 4. Bring your house wallet

The house wallet pays for prize vaults and players' first moves. To keep using your funded one:

```bash
# on your computer, in the project folder (stop any local copy of the game first)
tar czf house.tgz .wallets/house
scp -i ~/.ssh/zonar.pem house.tgz ubuntu@<elastic IP>:~
ssh -i ~/.ssh/zonar.pem ubuntu@<elastic IP> 'cd zonar && sudo bash deploy/import-house.sh ~/house.tgz'
```

**Don't run the game locally on the same house wallet afterwards.** Two copies spending at once collide.
To start fresh instead, skip this step and fund the address shown on the landing page from a testnet faucet.

## 5. Check it works

1. Open `https://<domain>` and play a match against the bot.
2. Create an agent wallet with your passkey. The house sends it 24 moves, spendable after about a block (~75 s).
3. From a second device on another network (a phone on mobile data), join a private match.
   Each move shows up as an on-chain transaction, and the winner can claim the prize.

Players on the same network still play, but as practice: prizes need two different networks.

## Day-to-day

```bash
ssh -i ~/.ssh/zonar.pem ubuntu@<elastic IP>
cd ~/zonar
```

| What | Command |
|---|---|
| Watch the logs | `docker compose logs -f --tail 100` |
| Restart | `docker compose restart` |
| Update to the latest code | `git pull && docker compose up -d --build` |
| Stop | `docker compose down` |
| First-boot progress | `sudo tail -f /var/log/cloud-init-output.log` |

Matches and wallets survive restarts and updates; unfinished payouts resume on boot.

SSH is allowed only from the IP you deployed from. From a new network, add your IP to the `zonar` security group.

## Backups

- **Disk snapshots:** EC2 → Elastic Block Store → **Lifecycle Manager** → create a daily snapshot policy for the instance's volume.
- **Off-server copy** of the wallets, every so often:

  ```bash
  ssh -i ~/.ssh/zonar.pem ubuntu@<elastic IP> 'cd zonar && sudo tar czf - .wallets .data' > zonar-backup-$(date +%F).tgz
  ```

  `.wallets` holds the house seed and any unswept vaults; lose it and their testnet funds are gone.

## Settings

Edit `docker-compose.prod.yml` on the server (or add lines to `.env`), then `docker compose up -d`.

| Setting | Default | What it does |
|---|---|---|
| `PRIZE_ZAT` | `1000000` | Prize per head-to-head win (0.01 TAZ) |
| `PRIZE_DAILY_BUDGET_ZAT` | `10000000` | Most the house pays in prizes per day |
| `PRIZE_MATCHES_PER_DAY` | `3` | Prize matches per player per day |
| `TURN_SECONDS` | `60` | Turn clock (on-chain matches get 90) |
| `ALLOW_SAME_IP` | `0` | `1` lets two tabs on one network play for prizes (testing only) |

## Tearing it down

Delete in this order: disable then delete the CloudFront distribution, terminate the instance, release the
Elastic IP, and (once you've saved `.wallets`) delete the volume, the security group and the key pair.

## Troubleshooting

- **CloudFront shows 502 or 504:** check the game is up (`docker compose ps`), and that the instance's security group still allows port 80 from the CloudFront prefix list.
- **"Open Zonar through its public link":** the request didn't carry the right `X-Origin-Secret`. Compare the distribution's origin header with `ORIGIN_SECRET` in `~/zonar/.env`.
- **The build stops with "killed":** check swap with `swapon --show`, then `docker compose build` again.
- **Passkey errors:** use the `https://…cloudfront.net` address, never the IP.
