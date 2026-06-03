# ZSK Provider Notes

## Public Sources

- ZSK Web API request documentation: https://catalog.zsk.de/api/web-api/requests.html
- `CreatePNG` TrueView preview example: https://catalog.zsk.de/api/web-api/createpng.html
- `CreateDST` output example: https://catalog.zsk.de/api/web-api/createdst.html
- response shape with `Success`, base64 `RequestData`, and `Info`: https://catalog.zsk.de/api/web-api/job_response_type.html
- ZSK Web API product page: https://www.zsk.de/de/software/webapi.php
- BasePac feature page: https://www.zsk.de/en/software/basepac/basepac-features.php
- sock/personalization workflow page mentioning ZSK WebAPI + BasePac automation: https://www.zsk.de/en/anwendungen/sticken/socken-besticken.php

## What The Public Docs Support

ZSK documents a hosted REST/JSON Web API with one `StitchJob` endpoint controlled by `RequestType`.

Documented request types include:

- `CreatePNG` for TrueView preview PNG.
- `CreateTC` for ZSK TC / `.z00`.
- `CreateTBF`.
- `CreateDST`.
- `GetEmbroideryInfo`.
- `GetNeedleInfo`.
- `GetNeedleSequence`.
- `GetFontList`.
- `GetFontSettings`.

The docs show JSON bodies containing `Monograms`, optional `EmbroideryType`, base64 `EmbroideryBase64`, `Needle`, `TrueView`, `PngResolution`, `EmbroiderySize`, `DesignOffset`, and DST needle assignment JSON. The response is documented as JSON with `Success`, base64 `RequestData`, optional `Info`, and optional timing data.

## Unknowns / Commercial Gaps

- The public pages describe `POST StitchJob`, but do not expose a tenant-specific base URL in the snippets available here.
- The product page says an API key is enough, but the exact auth header is not documented in the public snippets. The provider defaults to `x-api-key` and allows override through `ZSK_WEB_API_AUTH_HEADER`.
- Bitmap auto-digitizing from arbitrary PNG/JPG input is not documented in the ZSK Web API pages reviewed. BasePac supports auto-digitizing from images, but the Web API docs shown publicly focus on text/monograms and composition with existing TC/DST/TBF embroidery data.
- `CreateDST` documentation says the input format is TC and the output is DST. The provider therefore treats DST output from TC/Z00 input as the conservative path.

## Env Vars

- `ZSK_WEB_API_BASE_URL`: tenant/API host, without trailing slash. Example placeholder: `https://customer.example-zsk-host`.
- `ZSK_WEB_API_ENDPOINT`: optional path or full URL. Defaults to `/StitchJob`.
- `ZSK_WEB_API_KEY`: commercial API key.
- `ZSK_WEB_API_AUTH_HEADER`: optional auth header name. Defaults to `x-api-key`.

## Provider Behavior

- Always writes `zsk-request.json` into the run directory before any network call.
- If env vars are missing, throws a clear configuration error without pretending conversion succeeded.
- If the input is PNG/JPG or another bitmap, writes a skipped request/debug file and throws, because public docs do not confirm bitmap-to-stitch support.
- If configured, posts JSON to the configured `StitchJob` endpoint and stores `zsk-response.json`.
- For preview mode, builds `RequestType: "CreatePNG"` and expects PNG base64 in `RequestData`.
- For design mode, builds `CreateDST`, `CreateTC`, or `CreateTBF` based on requested output format and expects base64 stitch data in `RequestData`.

## Recommended UI Options

- Mode: `trueview` / `design`.
- Output format: `dst`, `z00`/`tc`, `tbf`.
- Text lines: one or more text lines for `Monograms[].Text`.
- Font family: default `Arial`.
- Font size in mm: default `10`.
- Needle number: default `1`.
- X/Y position in mm.
- Text stitch parameter: start with `Premium`, optionally `Dense` if confirmed by font settings.
- Preview resolution: default `254` dpi.
- TrueView controls: line thickness, brightness, lighting enabled, lighting angle, hide long stitches enabled, hide threshold.
- Existing embroidery upload format: TC/Z00, DST, or TBF. Prefer TC/Z00 when requesting DST output.

## Integration Note

`providers/zsk.mjs` exports `zskProvider`, but this worker intentionally did not edit `providers/index.mjs`. The main integration thread can import it and route `id === "zsk"` when ready.
