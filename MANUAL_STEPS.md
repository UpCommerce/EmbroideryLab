# Manual Steps — Embroidery Lab (staging)

Deploy su `zakeke-staging` (Talos on-prem), chart `one-tier-app v2.0.0`, release/namespace `embroidery-lab`.

> **Mai committare valori reali di secret/API key in questo file.** Solo nomi e fonti.

## Pre-deploy: Secrets su Azure Key Vault

Vault staging: `testing-ms.vault.azure.net`.

| Chiave Key Vault | Env var nel pod | Descrizione | Fonte |
| --- | --- | --- | --- |
| `embroiderylab-Wilcom--AppId` | `WILCOM_EWA_APP_ID` | App ID Wilcom EWA | Portale developer Wilcom / 1Password |
| `embroiderylab-Wilcom--AppKey` | `WILCOM_EWA_APP_KEY` | App Key Wilcom EWA | Portale developer Wilcom / 1Password |
| `embroiderylab-Melco--ApiKey` | `MELCO_CLOUD_API_KEY` | API key Melco Cloud | Melco Cloud console (l'ambiente della key deve combaciare con `MELCO_CLOUD_API_BASE_URL` nei values) |
| `embroiderylab-Zsk--WebApiBaseUrl` | `ZSK_WEB_API_BASE_URL` | Base URL Web API ZSK | Fornito da ZSK con la licenza ACE (non ha default pubblico) |
| `embroiderylab-Zsk--WebApiKey` | `ZSK_WEB_API_KEY` | API key Web API ZSK | Fornito da ZSK con la licenza ACE |
| `embroiderylab-Zsk--AceToken` | `ZSK_ACE_TOKEN` | Token licenza ACE | Fornito da ZSK con la licenza ACE |

PulseID non ha secret: usa l'endpoint pubblico documentato (`PULSEID_BASE_URL`, gia' nei values).

### Comandi pronti

Il vault e' `testing-ms` (confermato: e' il `vaultUrl` del `ClusterSecretStore/azure-keyvault`).
Prerequisito: `az login` (il token scade e va rifatto interattivamente).

`read -rs` evita che il valore finisca nella history della shell o a video:

```bash
az login
az account set --subscription "Visual Studio Enterprise: BizSpark"

set_secret() {
  read -rsp "$1 = " v && echo
  az keyvault secret set --vault-name testing-ms --name "$1" --value "$v" --output none \
    && echo "  ok: $1"
  unset v
}

# Wilcom
set_secret 'embroiderylab-Wilcom--AppId'
set_secret 'embroiderylab-Wilcom--AppKey'

# Melco
set_secret 'embroiderylab-Melco--ApiKey'

# ZSK - solo se la licenza ACE e' gia' disponibile.
# Altrimenti NON crearle e rimuovere le voci Zsk-- da .helm/values-staging.yaml
# (sezioni deployment.envSecretKeys e externalSecret.keys). Vedi il paragrafo sopra.
set_secret 'embroiderylab-Zsk--WebApiBaseUrl'
set_secret 'embroiderylab-Zsk--WebApiKey'
set_secret 'embroiderylab-Zsk--AceToken'
```

Verifica che ci siano tutte quelle attese (mostra solo i nomi, non i valori):

```bash
az keyvault secret list --vault-name testing-ms --query "[?starts_with(name,'embroiderylab-')].name" -o tsv
```

### Provider non ancora licenziati: leggere prima di deployare

**Tutte e sei le chiavi devono esistere nel Key Vault**, altrimenti l'ExternalSecret non sincronizza, il Secret `embroidery-lab-secrets` non viene creato e il pod resta in `CreateContainerConfigError`. Azure Key Vault **non accetta valori vuoti**, quindi non si puo' "creare la chiave e lasciarla vuota".

Per un provider di cui non si hanno ancora le credenziali (tipicamente ZSK), scegliere una delle due:

- **Rimuovere il provider dal deploy** (consigliato): eliminare le sue voci da `deployment.envSecretKeys` **e** da `externalSecret.keys` in [.helm/values-staging.yaml](.helm/values-staging.yaml). L'app rileva le env mancanti e mostra il provider come `unavailable`, che e' il comportamento corretto.
- **Placeholder in Key Vault**: creare la chiave con un valore fittizio (es. `unset`). Attenzione al lato negativo: l'app considera il provider `ready` perche' le env sono valorizzate, e il fallimento si manifesta solo al momento della conversione con un errore del provider remoto.

## Pre-deploy: Record DNS — FATTO

| Tipo | Nome | Destinazione | Stato |
| --- | --- | --- | --- |
| CNAME | `embroiderylab.zakeke.me` | `office.zakeke.com` -> `31.27.110.203` | creato e verificato |

Verifica:

```bash
dig +short embroiderylab.zakeke.me    # -> office.zakeke.com. 31.27.110.203
```

Il dominio segue lo stesso pattern di tutti gli staging funzionanti (`cn-mockups.zakeke.me`,
`contentremix.zakeke.com`): IP pubblico `31.27.110.203`, non l'IP privato di Traefik.

## Pre-deploy: Proxy Host su Nginx Proxy Manager — DA FARE

In staging il traffico passa da NPM prima di Traefik:

```text
Browser -> 31.27.110.203 (DNS pubblico)
        -> Nginx Proxy Manager     <- termina il TLS con un certificato proprio
        -> 192.168.34.44           <- LoadBalancer MetalLB del Service traefik (IP privato)
        -> Traefik                 <- routing per header Host -> Service dell'app
```

**Senza un Proxy Host per `embroiderylab.zakeke.me` il dominio non raggiunge il cluster**, anche
con DNS e Ingress corretti. Da configurare in NPM:

| Campo NPM | Valore |
| --- | --- |
| Domain Names | `embroiderylab.zakeke.me` |
| Forward Hostname/IP | `192.168.34.44` |
| Forward Port | `80` |

Traefik risponde `200` su `:80` e non forza redirect a HTTPS, quindi il forward su `80` va bene
(verificato dall'interno del cluster).

> **Il certificato che vede il browser e' quello di NPM**, non quello emesso da cert-manager per
> `embroiderylab-zakeke-me-tls`. Conseguenza: `kubectl get certificate` Ready **non** significa
> che il sito sia raggiungibile, e un certificato in-cluster scaduto non causa di per se' un
> disservizio. La verifica che conta e' la `curl` dall'esterno.

## Pre-deploy: Pipeline Azure DevOps

Org `mdavena`, progetto `Zakeke`. Il repo e' su GitHub (`UpCommerce/EmbroideryLab`), come le altre app Zakeke, quindi serve la service connection GitHub gia' usata dagli altri repo `UpCommerce/*`.

```bash
# ID della service connection GitHub esistente
az devops service-endpoint list --org https://dev.azure.com/mdavena --project Zakeke \
  --query "[?type=='github'].{name:name, id:id}" -o table

az pipelines create \
  --org https://dev.azure.com/mdavena --project Zakeke \
  --name 'EmbroideryLab' \
  --description 'Build & deploy Embroidery Lab' \
  --repository https://github.com/UpCommerce/EmbroideryLab \
  --repository-type github \
  --branch main \
  --yml-path .azure-devops/build-deploy.yml \
  --service-connection <GITHUB_SERVICE_CONNECTION_ID> \
  --skip-first-run true
```

> `--skip-first-run true` e' importante: senza, AzDO lancia subito una build. La pipeline ha
> `trigger: none` ed e' pensata per essere avviata a mano scegliendo `environment`.

**Ordine obbligatorio**: prima le chiavi in Key Vault, poi il primo run. Se il deploy parte con
le chiavi mancanti, l'ExternalSecret non sincronizza e il pod resta in `CreateContainerConfigError`.

Lo stage `CommitTagUpdates` fa `git push` del tag immagine sul branch: la service connection
GitHub deve avere permessi di **scrittura** sul repo, altrimenti lo stage fallisce dopo la build.

Primo run:

```bash
az pipelines run --org https://dev.azure.com/mdavena --project Zakeke \
  --name 'EmbroideryLab' --branch main --parameters environment=staging
```

## Post-deploy: Verifiche

```bash
# ExternalSecret SecretSynced=True
kubectl get externalsecret -n embroidery-lab

# Certificato TLS Ready=True
kubectl get certificate -n embroidery-lab

# PVC Bound (20Gi, longhorn)
kubectl get pvc -n embroidery-lab

# Pod Running
kubectl get pods -n embroidery-lab

# Endpoint
curl -s -o /dev/null -w "%{http_code}\n" https://embroiderylab.zakeke.me/health

# Provider visti dall'app: verifica quali risultano ready/unavailable
curl -s https://embroiderylab.zakeke.me/api/providers | jq '.providers[] | {id, status, missing}'

# Smoke test
helm test embroidery-lab -n embroidery-lab

# La history sopravvive al restart
kubectl rollout restart deployment -n embroidery-lab embroidery-lab
kubectl rollout status deployment -n embroidery-lab embroidery-lab
curl -s https://embroiderylab.zakeke.me/api/history | jq '.executions | length'
```

## Note operative

### Il PVC e' gestito da Helm

`helm uninstall embroidery-lab` **cancella il PVC** (`persistence.volumeClaims`) e la storageClass `longhorn` ha `reclaimPolicy: Delete`: history SQLite e artefatti in `runs/` vengono persi in modo irreversibile. Per un uninstall non distruttivo, fare prima un backup:

```bash
kubectl exec -n embroidery-lab deploy/embroidery-lab -- tar cf - -C /app data runs > embroidery-lab-backup.tar
```

### Espansione del disco

`longhorn` ha `allowVolumeExpansion: true`, ma Helm non applica il resize di un PVC esistente: cambiare `size` nei values non ha effetto sul volume gia' creato. Per espandere:

```bash
kubectl patch pvc embroidery-lab-data -n embroidery-lab -p '{"spec":{"resources":{"requests":{"storage":"40Gi"}}}}'
```

Poi allineare `size` in `values-staging.yaml`, altrimenti il prossimo `helm upgrade` va in conflitto. Longhorn non supporta il **restringimento**: da 20Gi non si torna indietro.

### Cosa consuma il disco

Il DB SQLite (`data/history.sqlite`) e' la parte piccola. La crescita viene da `runs/`: ogni conversione salva preview PNG, file macchina (`.emb`/`.dst`/`.z00`/`.ofm`) e request/response. Monitorare con:

```bash
kubectl exec -n embroidery-lab deploy/embroidery-lab -- du -sh /app/data /app/runs /app/logs /app/source-originals
```

### Esposizione pubblica senza autenticazione

L'ingress e' pubblico e l'app non ha login: chiunque raggiunga `https://embroiderylab.zakeke.me` puo' lanciare conversioni che **consumano crediti reali** dei provider e puo' leggere gli artefatti storici in `runs/`. Scelta consapevole per staging. Se in futuro serve chiudere l'accesso, la strada e' un middleware Traefik BasicAuth (precedente in cluster: `traefik/dashboard-auth`) piu' l'annotation `traefik.ingress.kubernetes.io/router.middlewares` sull'ingress.

### Perche' non c'e' values-prod.yaml

Il deploy e' singleton per costruzione: la history sta in SQLite su un volume `ReadWriteOnce`, quindi `replicaCount: 1` e `strategy: Recreate`. Due pod sullo stesso file SQLite corrompono il DB, e il secondo pod non riuscirebbe comunque ad attaccare il PVC.

L'hardening prod obbligatorio della guida (`hpa.minReplicas: 2`, `topologySpreadConstraints`) e' quindi **incompatibile con l'architettura attuale**. Prima di un `values-prod.yaml` serve una decisione:

- migrare la history su un database esterno (es. Postgres), rendendo l'app stateless e l'hardening applicabile in pieno; oppure
- accettare il singleton anche in prod, documentando la deviazione dalla guida (niente HPA, niente spread, downtime durante i rollout).

Nota aggiuntiva per prod: `securityContext.readOnlyRootFilesystem: true` richiede attenzione perche' l'app scrive anche in `public/samples/` (sostituisce i sample normalizzati), che non e' su PVC.

## Troubleshooting

| Sintomo | Probabile causa | Azione |
| --- | --- | --- |
| Dominio irraggiungibile / timeout / 502 dall'esterno, ma pod Running e `helm test` OK | Proxy Host mancante o mal configurato su NPM | E' il caso piu' probabile quando in cluster e' tutto verde: verificare il Proxy Host su NPM verso `192.168.34.44:80`. Test che bypassa NPM, da dentro il cluster: `kubectl run t --rm -i --restart=Never --image=curlimages/curl:8.10.1 -- curl -s -o /dev/null -w '%{http_code}' -H 'Host: embroiderylab.zakeke.me' http://traefik.traefik.svc.cluster.local/` — se risponde `200`, il problema e' a monte di Traefik |
| Certificato del browser inatteso (wildcard o nome diverso) | Il TLS e' terminato da NPM, non da Traefik | Comportamento normale: il Secret `embroiderylab-zakeke-me-tls` non e' quello servito. Il certificato va gestito su NPM |
| `ExternalSecret` in `SecretSyncedError` | Una delle 6 chiavi manca nel Key Vault | `kubectl describe externalsecret -n embroidery-lab`; verificare i nomi esatti (case-sensitive, doppio trattino) |
| Pod in `CreateContainerConfigError` | Secret non creato perche' l'ExternalSecret non ha sincronizzato | Risolvere prima l'ExternalSecret; il pod riparte da solo |
| Pod `CrashLoopBackOff`, log `EACCES` / `SQLITE_CANTOPEN` su `/app/data` | `fsGroup` assente o non applicato: il volume non e' scrivibile dall'utente `node` | Verificare `podSecurityContext.fsGroup: 1000` nei values e `kubectl get pod -o yaml` |
| Readiness sempre fallita, log `running at http://127.0.0.1:8080` | Env `HOST` non arrivata al container | Il bind su loopback non e' raggiungibile dal kubelet: verificare `deployment.env` contenga `HOST=0.0.0.0` |
| Rollout bloccato, nuovo pod `Pending` con `Multi-Attach error` | Deployment tornato a `RollingUpdate` | Il PVC e' RWO: `strategy.type` deve restare `Recreate` |
| `Certificate` resta `False` | DNS non propagato | `dig embroiderylab.zakeke.me` deve risolvere a `192.168.34.44`; cert-manager riprova ogni ~5min |
| Provider `unavailable` nella UI | Env del provider mancanti | `curl https://embroiderylab.zakeke.me/api/providers` elenca in `missing` le env attese |
| Conversioni falliscono con `ENOSPC` | PVC pieno per accumulo `runs/` | Vedere § Espansione del disco, oppure fare pulizia di `runs/` |
| `helm test` fallisce | `/health` non raggiungibile | Verificare `service.enabled=true` e che il pod sia Ready |
