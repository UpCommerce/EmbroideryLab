# Provider limitations and partner evaluation notes

Questo documento raccoglie limiti tecnici, vincoli osservati e domande aperte sui provider
di autodigitizing embroidery. L'obiettivo e avere una base solida per il documento finale di
comparazione partner per Zakeke.

Stato dei dati:

- `Documentato`: limite dichiarato nella documentazione pubblica.
- `Osservato`: comportamento visto nel Lab o nella demo, ma non necessariamente contrattuale.
- `Da confermare`: informazione necessaria per scegliere un partner SaaS, ma non trovata in modo
  pubblico o non abbastanza chiara.

## Summary matrix

| Provider | Input documentato | Limiti dimensione/risoluzione | Limiti colori/complessita | Output documentato/usato | Note principali |
| --- | --- | --- | --- | --- | --- |
| Wilcom EWA | Bitmap: JPG/JPEG, BMP, PNG, GIF, PSD, TIF. Vector: EPS, PDF. | Request < 20 MB, artwork auto-digitize max 2 MB, max 5,000,000 px, max 22,500 mm2, max processing 90 s. Support note: circa 300 DPI, area suggerita min 100 mm2. Per vector il pixel count e calcolato a 300 DPI. | Nessun massimo colori API pubblico. La support note raccomanda 5-6 colori per un logo efficiente, ma non e un hard limit. EWA dichiara color reduction interna; nel Lab abbiamo visto errore 151 su artwork complessi. | TrueView PNG, design file in formati embroidery Wilcom supportati, tra cui EMB, DST, EXP, PES, JEF e altri. | Il provider piu esplicito sui limiti hard, ma serve capire meglio la soglia di complessita/colori. |
| PulseID | Bitmap: BMP, JPG, PNG, TIF, PCX, MAC, PCD, TGA. Vector: CDR, CMX, EMF, WMF, EPS, AI. | Non trovato un limite pubblico su MB, pixel o area. Timeout autodigitize default 60 s. | `NumColors` controlla la palette: se inferiore ai colori originali prova a ridurre; se superiore ai colori originali puo generare eccezione. | Preview PNG/JPG/JPEG; production PXF, DST, TCF, PES, Z00, PCF. | Molte leve API, registrazione/test piu semplice, ma mancano limiti hard pubblici. |
| Melco Cloud | API `design-editor/digitize/*` usa `multipart/form-data` con campo `image_file`. Formati input non esplicitati nella spec pubblica consultata. | Non trovato un limite pubblico su MB, pixel, area o timeout. La spec espone `new_width` e `new_height` come query integer. | Non trovati parametri pubblici per riduzione colori o complessita sull'endpoint AutoDigitize. | Nel Lab: preview binaria e download OFM, DST, EXP. | L'API funziona, ma per una scelta partner servono limiti formali, SLA e policy dati. |
| ZSK ACE | PNG, JPG, BMP via `PictureType` + `PictureBase64`. | Non trovato un limite pubblico su MB, pixel, area o timeout. | `MaxColors` default 24; `Tolerance` 0-300; `RemoveArea` 0-200. ACE ha parametri espliciti per raggruppare colori e rimuovere aree piccole. | ACE documenta `CreatePNG` e `CreateTC`; il Lab usa TC/Z00 e conversione successiva a DST quando richiesta. | Tecnologicamente molto adatto allo scopo, ma serve tenant/API key con licenza ACE e limiti operativi. |

## Wilcom EWA

### Limiti documentati

Fonti:

- [Wilcom limitations](https://apiguide.wilcom.com/documents/api-interface-specification/limitations/)
- [Wilcom bitmap formats](https://apiguide.wilcom.com/documents/api-interface-specification/supported-formats/bitmap-formats/)
- [Wilcom vector formats](https://apiguide.wilcom.com/documents/api-interface-specification/supported-formats/vector-formats/)
- [Wilcom embroidery formats](https://apiguide.wilcom.com/documents/api-interface-specification/supported-formats/embroidery-formats/)
- [Wilcom autodigitize options](https://apiguide.wilcom.com/documents/api-interface-specification/api-xml-data-package-definitions/auto-digitize-options-recipe-autodigitize_options-xml-data/)

Input:

- Bitmap input: `.JPG`, `.JPEG`, `.BMP`, `.PNG`, `.GIF`, `.PSD`, `.TIF`.
- Vector input: `.EPS`, `.PDF`.
- Endpoint auto-digitize usati: `bitmapArtTrueview`, `bitmapArtDesign`, `vectorArtTrueview`,
  `vectorArtDesign`.

Limiti hard auto-digitize:

- Request size: meno di `20 MB`.
- Artwork max: `2 MB`.
- Pixel count max: `5,000,000 px`.
- Per file vector, il pixel count viene calcolato a `300 DPI`.
- Area max: `22,500 mm2`.
- Processing max: `90 s`.

Indicazioni aggiuntive dalla support note Wilcom del 3 febbraio 2022, presentate come linee guida di preflight:

- Area minima suggerita: `100 mm2`.
- Risoluzione raccomandata: circa `300 DPI` alla dimensione fisica richiesta.
- Una linea richiede circa `3 px` di larghezza per essere riconosciuta dall'AI; non e una soglia di cucibilita.
- Input ideale: loghi/emblemi con contorni definiti e colori piatti, senza gradienti.
- `5-6` colori e un target tipico per un logo produttivamente efficiente, non un massimo API.
- Gli oggetti molto piccoli possono essere rimossi come rumore.
- Le fotografie non dovrebbero essere inviate al workflow EWA descritto.

Dimensione fisica:

- `width` e `height` in `autodigitize_options` sono opzionali.
- Se mancano entrambi, Wilcom usa il DPI della sorgente.
- Se il DPI non e leggibile, Wilcom usa `96 DPI`.
- Se viene passato solo un lato, l'altro viene calcolato mantenendo le proporzioni.
- Se vengono passati entrambi, il risultato viene contenuto nel rettangolo indicato mantenendo
  le proporzioni.

Colori:

- `thread_file` permette di passare un chart `.tch`.
- `<threads>` permette di passare una lista di colori filo nominati.
- Se ci sono sia `<threads>` sia `thread_file`, `<threads>` ha precedenza.
- Wilcom dichiara una fase interna di riduzione colori prima della generazione stitch.
- Se non si passa palette/chart, usa la palette default o aggiunge il colore RGB processato.

### Limiti osservati nel Lab

- Errore `Wilcom 151`: immagine troppo complessa per AutoDigitizing.
- I casi piu sospetti sono immagini con gradienti, antialiasing pesante, molte micro-aree o
  troppi colori percepiti dopo la rasterizzazione.
- Il Lab applica gia limiti conservativi prima della chiamata:
  - max `4,900,000 px`;
  - target max `1,900,000 bytes`;
  - area target max `22,500 mm2`.

### Mitigazioni nel Lab

- Downscale/upscale comune prima di ogni provider.
- Per Wilcom, compressione e limiti piu stretti rispetto alla documentazione ufficiale.
- Palette Wilcom autopopolata dai colori dominanti dell'immagine e modificabile manualmente.
- Hook backend disponibile per semplificazione bitmap opzionale: `simplifyBitmap=true` riduce a
  una PNG palettizzata con `simplifyColors` colori e salva `wilcom-source-simplified.*` nella run.
  Al momento non e una opzione UI di default per evitare di cambiare i risultati senza scelta esplicita.

### Da chiedere a Wilcom

- Esiste un limite numerico pubblico o contrattuale sul numero di colori/aree?
- L'errore `151` dipende da numero colori, numero oggetti, aree piccole, tempo stimato o combinazione?
- Possono esporre parametri di preprocessing, per esempio `maxColors`, `minArea`, smoothing, tolerance?
- Quanti colori massimi sono raccomandati in `<threads>`?
- Qual e la strategia consigliata per gradienti e antialiasing da customizer?
- Rate limit, concurrency limit, retry policy e costo per chiamata auto-digitize.
- Retention/delete policy per immagini e design generati.

## PulseID

### Limiti documentati

Fonti:

- [PulseID Autodigitize](https://webapi.pulseidconnect.com/Documentation/Autodigitize)
- [PulseID Render](https://webapi.pulseidconnect.com/Documentation/Render)
- [PulseID Generate](https://webapi.pulseidconnect.com/Documentation/Generate)

Input:

- L'immagine deve essere caricata via Upload API prima di chiamare Autodigitize.
- Bitmap documentati: `.bmp`, `.jpg`, `.png`, `.tif`, `.pcx`, `.mac`, `.pcd`, `.tga`.
- Vector documentati: `.cdr`, `.cmx`, `.emf`, `.wmf`, `.eps`, `.ai`.

Parametri rilevanti:

- `ThreadThickness`: default `5mm`, valori supportati `1mm`-`99mm`.
- `ThreadType`: `ttMetallic`, `ttRayon`, `ttCotton`, `ttNylon`, `ttPolyester`.
- `NumColors`: numero colori nella palette. Se e inferiore ai colori originali, PulseID prova a
  selezionare la migliore riduzione; se e superiore ai colori originali, puo generare eccezione.
- `MaximumRunWidth`, `MaximumSatinWidth`, `MaximumSteilWidth`: soglie in embroidery points.
- Regola default segmenti:
  - `1-5 points`: run stitch;
  - `6-15 points`: steil stitch;
  - `15-70 points`: satin column;
  - `70+ points`: complex fill.
- `FinalWidth` e `FinalHeight`: dimensioni finali in embroidery points.
- `ProportionalResize`: default true.
- `TimeoutSeconds`: default `60 s`.

Preview/output:

- Render: `png`, `jpg`, `jpeg`.
- Render puo usare `ImageWidth`, `ImageHeight`, `DPI`, `Padding`, background ARGB e transparent PNG.
- Generate: `PXF`, `DST`, `TCF`, `PES`, `Z00`, `PCF`; default `PXF`.

### Da chiedere a Pulse/Tajima

- Max upload size in MB.
- Max pixel dimensions o max megapixel.
- Max area fisica consigliata per `FinalWidth`/`FinalHeight`.
- Rate limit, concurrency limit e timeout massimo impostabile.
- Limiti pratici/contrattuali su `NumColors`.
- Data retention/delete policy per immagini caricate e design generati.
- Se il public endpoint e adatto a SaaS production o serve tenant dedicato.

## Melco Cloud

### Limiti documentati nella spec pubblica

Fonti:

- [Melco Swagger portal](https://apis.melcocloud.com/docs/index.html)
- [Melco API service Swagger JSON](https://apis.melcocloud.com/apiservice/swagger/v1/swagger.json)
- [Melco Auto Digitization demo](https://apis.melcocloud.com/demos/auto-digitization/index.html)

Endpoint AutoDigitize rilevanti:

- `POST /auth/apikey`
- `POST /design-editor/digitize/metadata`
- `POST /design-editor/digitize/preview`
- `POST /design-editor/digitize/download`

Input:

- Gli endpoint `digitize/*` accettano `multipart/form-data`.
- Campo file: `image_file`.
- Query opzionali nella spec: `new_width`, `new_height`, entrambi `integer`.
- Nella demo e nel Lab, `new_width/new_height` seguono la scala `mm * 10`.

Output:

- `metadata`: JSON `Melco.Models.Design`.
- `preview`: file binario.
- `download`: file binario.
- Nel Lab sono esposti `OFM`, `DST`, `EXP`.

### Limiti non trovati pubblicamente

Non abbiamo trovato nella Swagger pubblica consultata:

- formati input accettati in modo esplicito per `image_file`;
- max MB upload;
- max pixel dimensions o megapixel;
- max area fisica;
- timeout dichiarato;
- rate limit o concurrency limit;
- parametri pubblici per riduzione colori, semplificazione, soglie stitch o gestione gradienti.

### Da chiedere a Melco

- Lista formati input supportati e raccomandati per auto-digitization.
- Max file size, max pixel count, max width/height e limiti area.
- Significato contrattuale di `new_width/new_height` e unita ufficiale.
- Opzioni disponibili per controllare colori, sfondo, soglie e stitch style.
- Rate limit, concurrency, SLA, retry policy.
- Differenze fra sandbox e production.
- Retention/delete policy per immagini e output.
- Cost model per preview, metadata e download.

## ZSK ACE

### Limiti documentati

Fonti:

- [ZSK Embroidery API](https://www.embroidery-api.com/)
- [ZSK ACE example request](https://www.embroidery-api.com/api/ACE/section/ExampleRequest)
- [ACEParaBitmapOptimize](https://www.embroidery-api.com/api/ACE/section/ACEParaBitmapOptimize)
- [ACEParaBitmapToVector](https://www.embroidery-api.com/api/ACE/section/ACEParaBitmapToVector)
- [ACEParaBitmapToPunch](https://www.embroidery-api.com/api/ACE/section/ACEParaBitmapToPunch)

Input:

- `Client: "ACE"` abilita il processamento ACE.
- `PictureType`: `PNG`, `JPG`, `BMP`.
- `PictureBase64`: immagine codificata base64.

Output/request type:

- ACE documenta `CreatePNG` e `CreateTC`.
- Il Lab salva preview PNG e design TC/Z00.
- Per DST, il Lab usa una conversione successiva dal risultato TC quando disponibile.

Parametri colore/complessita:

- `ACEParaBitmapOptimize.Resolution`: DPI; se non specificato, usa la risoluzione presente nel bitmap.
- `ImageType`:
  - `0`: clipart, aree ben definite e colori distinti;
  - `1`: scanned image, prova a combinare pixel dithered in aree uniformi;
  - `2`: clipart highlight black;
  - `3`: scanned image highlight black.
- `Tolerance`: default `150`, range `0-300`, raggruppa colori simili nello spazio RGB.
- `RemoveArea`: default `60`, range `0-200`, elimina aree piccole in 1/100000 della dimensione totale.
- `MaxColors`: default `24`, massimo numero colori a cui ridurre il bitmap.

Parametri vector/stitch:

- `ACEParaBitmapToVector.Tolerance`: default `20`, range `0-300`.
- `Smoothing`: default `50`, range `0-200`.
- `DetermineBackgroundColor`: automatico o manuale.
- `BackgroundColor`: RGB.
- `BackgroundFill`: include/esclude aree con colore background.
- `LineWidth`: in 1/10 mm.
- `SatinStitchWidth`: in 1/10 mm.
- `Overlap`: in 1/10 mm.
- `MinimumAreaSize`: mm2.
- `MinimumHoleSize`: mm2.
- `MinimumLineLength`: in 1/10 mm.
- `UseThreadCones`: filename chart JSON, per esempio `Amann-Isacord 40.json`.

### Limiti non trovati pubblicamente

- Max request size/base64 size.
- Max MB immagine.
- Max pixel count o max width/height.
- Max area fisica.
- Rate limit, concurrency e timeout.
- Se `CreateDST` diretto e disponibile nel tenant ACE o se serve sempre conversione successiva.

### Da chiedere a ZSK

- Base URL esatto del tenant e endpoint operativo.
- Header auth e formato valore: l'esempio pubblico usa `X-API-Key`, ma serve conferma tenant.
- Licenza ACE necessaria e limiti inclusi.
- Max request/base64 size, max pixel count e timeout.
- Rate limit, concurrency e costo per job.
- Retention/delete policy.
- Lista completa di thread cone chart disponibili nel tenant.

## Preflight checks recommended for Zakeke

Prima di chiamare qualsiasi provider, il backend dovrebbe calcolare e salvare:

- formato e MIME sorgente;
- dimensioni pixel, megapixel e byte;
- presenza alpha/trasparenza;
- DPI se presente;
- dimensione fisica target in mm e area in mm2;
- numero colori stimato;
- palette dominante;
- indice di complessita: tanti colori vicini, gradienti, antialiasing, micro-aree;
- versione inviata al provider dopo resize/compressione/preprocessing;
- request/response complete, status, durata, output, preview e metadata.

Regole conservative attuali nel Lab:

- default max lato sorgente `3000 px`;
- default min lato sorgente `500 px`;
- per Wilcom: max `4,900,000 px`, target max `1,900,000 bytes`, area max `22,500 mm2`.

## Vendor questionnaire

Domande comuni da fare a ogni provider:

- Quali formati immagine input sono supportati e raccomandati?
- Max file size in MB?
- Max pixel count o max width/height?
- Max area fisica o dimensioni ricamo?
- Limiti su colori, palette, gradienti, aree piccole e complessita?
- Parametri per controllare riduzione colori e gestione background?
- Output file supportati e qualita dei metadati restituiti?
- Rate limit, concurrency, timeout massimo, retry policy?
- Differenze sandbox/production?
- Cost model: per preview, per file, per job, per stitch count?
- Data retention, delete API, region hosting, privacy/SaaS terms?
- SLA, supporto tecnico, escalation e accesso a error codes dettagliati?

