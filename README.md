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
- Melco Cloud AutoDigitize: collegato al backend, richiede API key Melco Cloud.
- ZSK ACE: collegato al backend per image-to-embroidery, richiede endpoint/API key ZSK con licenza ACE.

## Documento comparativo

Le limitazioni note, i vincoli osservati e le domande aperte per scegliere i partner sono raccolti in
`docs/provider-limitations.md`.

## Confronto provider

Il bottone `Compare` apre un wizard che esegue chiamate reali a `/api/convert` per ogni combinazione selezionata:

1. immagini caricate e/o sample dalla libreria;
2. provider disponibili;
3. modalita `Preview` o `Design file`.

Al termine del confronto il wizard si chiude e si apre una dialog di riepilogo con sorgente, preview generata, metriche e link agli artefatti. Il bottone `Download recap` genera un file Markdown organizzato per immagine sorgente, con preview a dimensione fissa e link ai file salvati in `runs/`.

Nel confronto provider, Melco viene eseguito con `Use Melco default size` attivo di default, quindi il backend non invia `new_width/new_height` per le run Melco del wizard.

## Regola UI/opzioni

La UI mostra solo opzioni che hanno effetto sulla request reale del provider selezionato:

- `Format` compare solo in modalita `Design file`; in `TrueView` non viene inviato.
- `Max source side px` e `Min source side px` sono opzioni comuni: il backend normalizza la sorgente prima di chiamare qualsiasi provider.
- `Target width/height mm` compare solo quando il provider usa una size fisica nella chiamata. Viene nascosto e omesso per Melco con `Use Melco default size` attivo e per PulseID con `Use image dimensions` attivo.
- Le opzioni nei pannelli provider sono inviate solo a quel provider.

## Preprocessing sorgente

Prima di chiamare il provider, il Lab normalizza l'immagine sorgente:

- se il lato piu lungo supera `Max source side px`, fa downscale mantenendo le proporzioni;
- se il lato piu corto e sotto `Min source side px`, fa upscale mantenendo le proporzioni;
- default: max `3000px`, min `500px`;
- `0` disattiva la rispettiva regola.

Per Wilcom il backend applica sempre limiti aggiuntivi, anche se la UI invia solo `Max source side px`:

- max `4.900.000` pixel, per stare sotto il limite Wilcom ufficiale di `5.000.000`;
- target max `1.900.000` bytes per l'artwork inviato;
- area target max `22.500 mm2`, validata prima della chiamata Wilcom.

Se una test image viene ridimensionata, l'originale viene spostato in `source-originals/samples/` e la versione ridotta sostituisce il file in `public/samples/`. Per upload manuali, l'originale viene copiato in `source-originals/uploads/` e la conversione usa solo la versione normalizzata.

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
- `Use image dimensions`: usa le dimensioni immagine nel calcolo finale; quando e attivo il Lab nasconde e non invia `Target width/height mm`.

## Opzioni Wilcom

Wilcom EWA e collegato al backend. Il pannello Wilcom mostra solo opzioni che finiscono nella request Wilcom:

- `DPI`: DPI della preview/output Wilcom.
- `Thread palette`: colori filo nominati da passare a Wilcom; viene autopopolata dai colori dominanti dell'immagine selezionata, ogni swatch e un color picker inline, con `x` per rimuoverlo e `+` per aggiungerne uno nuovo.
- `Thread chart .tch`: file chart Wilcom da inviare come `thread_file`; un esempio minimale e in `docs/wilcom-thread-chart-example.tch`.
- `Remove background`: chiede a Wilcom di rimuovere lo sfondo bitmap prima del digitizing.

Wilcom accetta bitmap `JPG/JPEG/BMP/PNG/GIF/PSD/TIF` e, tramite endpoint vector, `PDF/EPS`. I limiti ufficiali di auto digitizing sono: request `<20 MB`, artwork max `2 MB`, pixel count max `5.000.000`, area max `22.500 mm2`, processing max `90s`.

## Opzioni Melco

- `Use Melco default size`: se attivo, il backend non invia `new_width/new_height` e lascia decidere Melco.

## Opzioni ZSK ACE

ZSK usa ACE per convertire bitmap `PNG/JPG/BMP` in dati embroidery:

- in `TrueView` invia `RequestType: CreatePNG` e salva `zsk-ace-preview.png`;
- in `Design file` invia anche `CreateTC` e salva `zsk-ace-design.z00`;
- se il formato richiesto e `DST`, converte il TC ottenuto con una seconda chiamata `CreateDST`.

Le opzioni UI corrispondono ai blocchi documentati da ZSK:

- `Image type`: `ACEParaBitmapOptimize.ImageType`.
- `Max colors`: `ACEParaBitmapOptimize.MaxColors`.
- `Color tolerance`: `ACEParaBitmapOptimize.Tolerance`.
- `Remove area`: `ACEParaBitmapOptimize.RemoveArea`.
- `Vector tolerance`: `ACEParaBitmapToVector.Tolerance`.
- `Smoothing`: `ACEParaBitmapToVector.Smoothing`.
- `Auto background`: `ACEParaBitmapToVector.DetermineBackgroundColor`.
- `Background color`: `ACEParaBitmapToVector.BackgroundColor`.
- `Fill background`: `ACEParaBitmapToVector.BackgroundFill`.
- `Line width`, `Satin width`, `Overlap`, `Min area`, `Min hole`, `Min line length`: `ACEParaBitmapToPunch`.
- `Thread cones`: opzionale, inviato come `ACEParaBitmapToPunch.UseThreadCones`.

## Avvio

```powershell
cd C:\Users\afrat\Documents\GitHub\EmbroideryLab\EmbroideryLab
npm install
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
SOURCE_MAX_SIDE_PX=3000
SOURCE_MIN_SIDE_PX=500
MELCO_CLOUD_API_BASE_URL=https://sandbox-apis.melcocloud.com
MELCO_CLOUD_API_KEY=...
MELCO_CLOUD_OUTPUT_FORMAT=ofm
ZSK_WEB_API_BASE_URL=...
ZSK_WEB_API_KEY=...
ZSK_WEB_API_AUTH_HEADER=
ZSK_WEB_API_AUTH_SCHEME=
ZSK_WEB_API_ENDPOINT=/StitchJob
ZSK_ACE_TOKEN=...
ZSK_ACE_THREAD_CONES=
PORT=5174
```

Senza credenziali Wilcom, Wilcom resta visibile ma non disponibile.
PulseID usa di default l'endpoint pubblico documentato; se serve un endpoint diverso, cambiare `PULSEID_BASE_URL`. Melco usa la base URL dell'ambiente associato alla API key, per esempio sandbox `https://sandbox-apis.melcocloud.com`. ZSK resta non disponibile finche non sono configurati base URL e API key.

Il Lab non ha una modalita dry-run: quando un provider e disponibile, il bottone `Run conversion` prova davvero la conversione e salva request/response in `runs/`.

## Log errori

Gli errori remoti dei provider non devono far cadere il server. Il Lab salva:

- storico globale: `logs/server-errors.ndjson`;
- log della singola conversione: `runs/<runId>/error.json`.

Quando una conversione fallisce, la UI mostra un link a `error.json` negli artefatti della run.

## Output

Ogni run viene salvata in:

```text
embroidery-lab/runs/
```

I file tipici sono:

- `wilcom-request.xml`;
- `wilcom-response.xml`;
- `source-sent.*`, cioe l'immagine normalizzata effettivamente usata dal provider;
- `source.json`;
- `pulseid-request.json`;
- `melco-source-sent.*`, cioe l'immagine effettivamente inviata a Melco;
- `melco-source.json`;
- `melco-request.json`;
- `melco-metadata.json`;
- `melco-preview.png` oppure filename restituito da Melco;
- `pulseid-upload-response.txt`;
- `pulseid-preview.png`;
- `zsk-ace-preview-request.json`;
- `zsk-ace-preview-response.json`;
- `zsk-ace-preview.png`;
- `zsk-ace-design-request.json`;
- `zsk-ace-design-response.json`;
- `zsk-ace-design.z00` o `zsk-ace-design.dst`;
- `trueview.png`;
- `design.emb`, `design.dst`, ecc.;
- `design-info.json`.
