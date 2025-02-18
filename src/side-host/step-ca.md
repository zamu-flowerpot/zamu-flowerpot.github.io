# step-ca

I definitely have some knowledge that I haven't written down here, but I haven't set up another since the last one to validate the configuration.
I originally used this article, [Build a Tiny CA with Raspberry PI and YubiKey](https://smallstep.com/blog/build-a-tiny-ca-with-raspberry-pi-yubikey/), which is good.
You don't *need* the YubiKey and can just leave the key and cert on the local disk if your threat model is safe enough.
But yeah, the tutorial definitely can help fill in any weird blanks I've left below. I'd even say read through the tutorial and then use this as a reference if this makes sense.
That said feel free to ping me if you have questions.

## install step-ca

```bash
# note the fingerprint value (sha256 checksum of the root.crt) as it's used by the step-cli client for bootstrapping
# I generally just download the root.crt and generate it (ie calculate the sha256),
# but you probably should have fingerprint via a separate channel and do it right.
step ca init --ssh --acme --password-file ${STEPCA_PASS_FILE} --provisioner-password-file ${STEPCA_PROV_PASS_FILE} --remote-management
step-ca $(step path)/config/ca.json --password-file ${STEPCA_PASS_FILE}
```

## configuring step-ca

You can find the configuration file at `echo $(step path)/config/ca.json`.

Check out step's own documentation for configuring `step-ca` at [StepCA Config docs](https://prof.infra.smallstep.com/docs/step-ca/configuration).

Of note (for me) were:

* `ssh` in general to configure ssh ca
* passing the CA password via `--password-file` for the systemd service so it's not interactive
* `db` if you want better support. (I'm currently just using bbolt, but probably should have spun up postgresql)
* `authority` and specifically the `provisioners` subsection which sets up what things can talk to step ca and how
* `authority` level `policy` which allows enough control to allow you to restrict who and what gets to create and be created.
* I also tweaked `ssh` templates since I tend to run all my sshd on a non-standard port.

Read through [CA Server Production Setup docs](https://prof.infra.smallstep.com/docs/step-ca/certificate-authority-server-production) to make sure that you don't hit footguns.

SmallStep provide a `systemd` service unit for step-ca in this subsection of the [Production Setup docs](https://smallstep.com/docs/step-ca/certificate-authority-server-production#create-a-service-user-to-run-step-ca).


## configuring remote clients to talk to step ca

### Step CLI

```bash
CA_URL=""
CA_CERT_FINGERPRINT=""
# download the root.crt
curl -OJL https://example.com/root.crt
# if lazy
# CA_CERT_FINGERPRINT="$(step certificate fingerprint root.crt)"

# for the step-cli tool
step ca bootstrap --ca-url ${CA_URL} --fingerprint ${CA_CERT_FINGERPRINT}
# now install root crt to trust store
step certificate install ./root.crt
# or
#sudo trust anchor ./root.crt
# or
#sudo cp root.crt /etc/pki/ca-trust/source/anchors/example-com.crt && sudo update-ca-trust
```

### caddy

I use caddy since it does ACME automatically without configuring extra side services or needed custom builds which bundle the side service (like nginx & co.).

See [Step CA ACME client setup docs](https://smallstep.com/docs/tutorials/acme-protocol-acme-clients#caddy-v2).

For mTLS shenanigans, here is the relevant caddy config changes I've done.

#### mtls caddy config


```bash
CA_URL="${CA_URL:-https://localhost:8443/acme/acme/directory}"
CA_ROOT_CERT=$(step path)/certs/root_ca.crt
sudo tee /etc/caddy/Caddyfile << EOF
{
  admin off
  email caddy-service-account@example.com
  acme_ca ${CA_URL}
  acme_ca_root ${CA_ROOT_CERT}
  renew_interval 16h
  debug
}
(common) {
  log {
    output file /tmp/caddy/access.log {
      roll_size 512MiB
      roll_keep_for 720h
    }
    format json
  }
}
(secure) {
  import common
  tls {
    client_auth {
      mode require_and_verify
      trust_pool file ${CA_ROOT_CERT}
    }
  }
}
some-service.example.local {
  # some low security service
  reverse_proxy http://someip:9999 {
    header_up Host {host}
  }
  import common
}
secure-service.example.local {
  reverse_proxy http://otherip:3333 {
    header_up Host {host}
  }
  import secure
}
EOF
```

Other services are described on the page though so feel free to configure and find what works for you.

### But what about service discovery?!

Yeah that's one of the pain points here. Caddy technically can hit up some DNS and submit the DNS A (and/or AAAA) record for your service that just got a TLS cert assigned, but I never got around to host PowerDNS and the other DNS servers which support this type of configuration are a pain. Instead I just have a CoreDNS instance which wildcards a domain for each host which makes this very simple. So anything that is registered to `example.com` or `*.example.com` is routed correctly.

There are pain points, but I found this to works in a "good enough" manner to not matter.

#### CoreDNS Corefile

```bash
PROMETHEUS_SCRAPE_ENDPOINT="someip:9253"
sudo tee /etc/coredns/Corefile << EOF
(common) {
  loop
  header {
    response set ra aa
  }
  log . {
    class denial error
  }
  prometheus ${PROMETHEUS_SCRAPE_ENDPOINT}
  cache 300
}
example.local {
  import common
  file /etc/coredns/db.example.local example.local
}
EOF
```

#### example CoreDNS db.example.local

```bash
DNS_SERVER_IP=${DNS_SERVER_IP:-$HOSTNAME}
EXAMPLE_LOCAL_IP=${EXAMPLE_LOCAL_IP:-127.0.0.1}
sudo tee /etc/coredns/db.example.local << EOF
\$TTL 1D
\$ORIGIN example.local.
@ 3600 IN SOA ${DNS_SERVER_IP}. admin@example.local (
  202111111
  1D
  1H
  1W
  300
)
@ IN A ${EXAMPLE_LOCAL_IP}
* IN A ${EXAMPLE_LOCAL_IP}
EOF
```

## SSH CA configuration
### bootstrap base requirements

```bash
VERSION="0.28.2"
curl -OJL "https://dl.smallstep.com/gh-release/cli/gh-release-header/v${VERSION}/step_linux_${VERSION}_amd64.tar.gz"
tar xvf "./step_linux_${VERSION}_amd64.tar.gz"
```

```bash
CA_URL=${CA_URL:-"https://127.0.0.1:8443"}
sudo cp ./bin/step /usr/local/bin/step
curl -L "${CA_URL}/root.crt" -O- > root.crt

# bootstrap step-cli
step ca bootstrap --ca-url="${CA_URL}" --fingerprint="$(step certificate fingerprint root.crt)"
```

### sshd configuration

Remember that principal files (ie `/etc/ssh/principals/`) are a mapping of filename (which is a user name) to the list of principals (or labels in this case) which are allowed to sign in.
So you can use stuff like groups (eg. `dev`, `admin`, `audio`) or whatever really.
So if I create a SSH cert with the `zamu` principal, I could to login to root if I had `zamu` as a line in `/etc/ssh/principals/root`.


```bash
NAME="${NAME:-$HOSTNAME}"
PRINCIPAL="${PRINCIPAL:-admin}"
USER="${USER}"
SSH_PORT="${SSH_PORT:-22}"
# get the right keys in the right place
step ssh config --roots | sudo tee /etc/ssh/ssh_user_key.pub
step ssh config --roots --host | sudo tee /etc/ssh/ssh_host_ecdsa_key
# configure your local user's ssh
step ssh config

# generate host keys and put them in the right place
mkdir /tmp/stepca/ && cd /tmp/stepca/
# unfortunately this generates multiple files and based on the key file name so unless you want to configure the
# root user to have step cli bootstrapped as well, it's best to generate them and then copy them into the right place
step ssh certificate "${NAME}" /tmp/stepca/ssh_host_ecdsa_key --no-password --insecure --host --not-after=87600h
sudo mv /tmp/stepca/ssh_host_ecdsa_key* /etc/ssh/

# enable base sshd config
# these are just my personal SSH configuration changes feel free to do what you want.
# this expects the first line in /etc/ssh/sshd_config to be an `Include /etc/ssh/sshd_config.d/*`
# you can instead just manually tweak the sshd_config file, but drop ins are nice
# also sshd_config drop-ins are first instance binding instead of last value in, so you might want to bind earlier.
sudo tee /etc/ssh/sshd_config.d/10-homelab.conf << EOF
Port ${SSH_PORT}
PermitRootLogin no
PubkeyAuthentication yes
AuthorizedKeysFile	.ssh/authorized_keys
AuthorizedPrincipalsFile /etc/ssh/principals/%u
PasswordAuthentication no
KbdInteractiveAuthentication no
GSSAPIAuthentication no
UsePAM yes
EOF

# enable ssh ca cert configuration
sudo tee /etc/ssh/sshd_config.d/11-stepca.conf << EOF
TrustedUserCAKeys /etc/ssh/ssh_user_key.pub
HostKey /etc/ssh/ssh_host_ecdsa_key
HostCertificate /etc/ssh/ssh_host_ecdsa_key-cert.pub
EOF

sudo mkdir -p /etc/ssh/principals/
echo "$PRINCIPAL" | sudo tee /etc/ssh/principals/${USER}
```

```bash
sudo systemctl restart sshd
```

### ssh user keys

```bash
PRINCIPAL="${USER}"
REMOTE_USER="${USER}"
SSH_PORT="${SSH_PORT:-22}"
HOST="${HOST:-localhost}"
# get the right local ssh key
step ssh login -n=${PRINCIPAL} # -n=${PRINCIPAL2} and so on
# then just ssh in
ssh -p ${SSH_PORT} -l ${REMOTE_USER} ${HOST}
```