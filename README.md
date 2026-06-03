# Embroidery Lab

Web app locale per testare provider embroidery uno alla volta con lo stesso flusso:

1. immagine sorgente;
2. provider;
3. parametri ricamo;
4. preview/output;
5. artefatti salvati per confronto.

I sample sono in `public/samples/`.
La web app li elenca nella sezione `Test images`: si puo scegliere un sample dalla griglia oppure caricare un file manualmente.
Il bottone `Load sample` ricarica il sample selezionato.

## Provider attivo

- Wilcom EWA: collegato al backend.
- PulseID: collegato al backend.
- Melco Fusion, ZSK: placeholder per i prossimi PoC.

## Test PulseID

Per testare PulseID davvero:

1. selezionare `PulseID`;
2. usare `TrueView` per ottenere solo la preview embroidery;
3. usare `Design file` per ottenere preview + file macchina;
4. cliccare `Run conversion`.

PulseID carica l'immagine sull'endpoint pubblico documentato e salva gli artefatti in `runs/`.
In modalita `Design file`, il Lab genera comunque anche `pulseid-preview.png`, cosi il risultato e confrontabile visivamente.

## Opzioni PulseID

Le opzioni PulseID sono visibili solo quando il provider selezionato e `PulseID`.
Le opzioni comuni restano fuori dai pannelli provider; le opzioni specifiche di Wilcom/PulseID sono separate per evitare controlli visibili ma non collegati.

- `Thread type`: tipo filo usato dal motore di autodigitizing. Valori: polyester, rayon, cotton, nylon, metallic.
- `Thread thickness`: spessore filo PulseID. Vuoto usa il default del servizio.
- `Ignore small areas`: ignora piccole aree/sfondi minuti, utile per ridurre rumore su bitmap.
- `Create satin/steil`: se attivo crea satin/steil dove possibile; se spento Pulse usa piu complex fill.
- `Add steil borders`: aggiunge bordi steil ad aree fill grandi.
- `Stitch background`: prova a ricamare anche il background. Di solito va lasciato spento per preview da customizer.
- `Sequence`: strategia di cucitura. `Min colors` riduce cambi colore, `Min jumps` riduce salti, `Smart` prova a ordinare meglio bordi e fill.
- `Trim`: strategia trims. `Always` e il default piu aggressivo, `Never` evita trims, `Trim at` dipende dalla soglia.
- `Lock`: lock stitch. `Around trim` e il default documentato.
- `Trim threshold`: distanza/soglia trims; vuoto usa default PulseID.
- `Run/Satin/Steil max width`: soglie avanzate in embroidery points per decidere che tipo punto usare in base allo spessore segmento.
- `Num colors`: riduzione colori. Lasciarlo vuoto di default: PulseID puo fallire se il valore supera i colori presenti nell'immagine.
- `Render width/height`: dimensione della preview PNG restituita.
- `Padding`: margine intorno al design renderizzato.
- `Recipe`: recipe PulseID da applicare, default `Normal`.
- `Proportional resize`: mantiene le proporzioni dentro width/height.
- `Lighten shadows`: schiarisce ombre nella preview, utile su fili chiari.
- `Transparent preview`: renderizza PNG con sfondo trasparente.
- `Use image dimensions`: usa dimensioni immagine nel calcolo finale; di solito spento per avere controllo tramite mm.

## Opzioni Wilcom

Wilcom resta non disponibile finche non abbiamo credenziali EWA. Quando sara disponibile, il pannello Wilcom mostrera solo opzioni Wilcom:

- `DPI`: DPI della preview/output Wilcom.
- `Thread palette`: colori filo nominati da passare a Wilcom.
- `Remove background`: chiede a Wilcom di rimuovere lo sfondo bitmap prima del digitizing.

## Avvio

```powershell
cd C:\Users\afrat\Documents\Codex\2026-05-29\partiamo-con-un-nuovo-progetto-il\embroidery-lab
node .\server.mjs
```

Poi aprire:

```text
http://127.0.0.1:5174
```

Se la porta e occupata, il server prova le porte successive.

## Credenziali e disponibilita

Creare `embroidery-lab/.env`:

```text
WILCOM_EWA_APP_ID=...
WILCOM_EWA_APP_KEY=...
WILCOM_EWA_BASE_URL=https://public.ewa.wilcomapps.com
PULSEID_BASE_URL=https://webapi.pulseidconnect.com
PORT=5174
```

Senza credenziali Wilcom, Wilcom resta visibile ma non disponibile.
PulseID usa di default l'endpoint pubblico documentato; se serve un endpoint diverso, cambiare `PULSEID_BASE_URL`.

Il Lab non ha una modalita dry-run: quando un provider e disponibile, il bottone `Run conversion` prova davvero la conversione e salva request/response in `runs/`.

## Output

Ogni run viene salvata in:

```text
embroidery-lab/runs/
```

I file tipici sono:

- `wilcom-request.xml`;
- `wilcom-response.xml`;
- `pulseid-request.json`;
- `pulseid-upload-response.txt`;
- `pulseid-preview.png`;
- `trueview.png`;
- `design.emb`, `design.dst`, ecc.;
- `design-info.json`.
