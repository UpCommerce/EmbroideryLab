# ZSK ACE Provider Notes

## Public Sources

- ZSK API sample portal: https://www.embroidery-api.com/
- Automated Computed Embroidery: https://www.embroidery-api.com/api/ACE
- ACE example request: https://www.embroidery-api.com/api/ACE/section/ExampleRequest
- ACE optimize parameters: https://www.embroidery-api.com/api/ACE/section/ACEParaBitmapOptimize
- ACE vector parameters: https://www.embroidery-api.com/api/ACE/section/ACEParaBitmapToVector
- ACE punch parameters: https://www.embroidery-api.com/api/ACE/section/ACEParaBitmapToPunch
- ZSK Web API response shape: https://www.embroidery-api.com/api/ZSKWebApi/section/JobResponseType

## Why ACE

The previous ZSK PoC was based on the classic ZSK Web API flow, which is useful for text,
monograms, preview rendering, and conversion of existing embroidery data. It did not solve
the Lab's main use case because the public Web API snippets do not document bitmap
auto-digitizing.

ACE is the relevant ZSK path for this project because the documentation explicitly describes
creating embroidery data from image data and lists bitmap input formats:

- BMP
- PNG
- JPG

## Current Implementation

`providers/zsk.mjs` now treats bitmap input as an ACE job:

- Preview mode sends `RequestType: "CreatePNG"` with `Client: "ACE"`.
- Design mode first sends `CreatePNG` so the Lab still has a visual preview.
- Design mode then sends `RequestType: "CreateTC"` to create TC/Z00 embroidery data.
- If the requested output format is `DST`, the provider sends a follow-up classic Web API
  request: `RequestType: "CreateDST"`, using the TC result from ACE as `EmbroideryBase64`.

Each network call writes full request/response artifacts into the run directory:

- `zsk-ace-preview-request.json`
- `zsk-ace-preview-response.json`
- `zsk-ace-design-request.json`
- `zsk-ace-design-response.json`
- `zsk-dst-conversion-request.json`
- `zsk-dst-conversion-response.json`

Output files:

- `zsk-ace-preview.png`
- `zsk-ace-design.z00`
- `zsk-ace-design.dst`

## Required Manual Data

ZSK ACE still requires commercial/tenant configuration. The Lab cannot test real calls until
these are known:

- `ZSK_WEB_API_BASE_URL`: tenant/API base URL, without trailing slash. The docs show this as
  `https://ZSKAddress`.
- `ZSK_WEB_API_ENDPOINT`: path or full URL. Defaults to `/StitchJob`.
- `ZSK_WEB_API_KEY`: commercial API key.
- `ZSK_WEB_API_AUTH_HEADER`: auth header name. Defaults to `x-api-key`.
- `ZSK_WEB_API_AUTH_SCHEME`: optional prefix such as `Bearer`; leave empty when the header value
  should be the raw key.
- Active license/plan for ACE.

Optional:

- `ZSK_ACE_THREAD_CONES`: default ACE `UseThreadCones` filename.

## Implemented UI Options

The UI exposes only options that are sent in the ACE request:

### ACEParaBitmapOptimize

- `ImageType`: clipart/scanned image and highlight-black variants.
- `Tolerance`: color grouping tolerance, 0-300.
- `RemoveArea`: small region removal, 0-200.
- `MaxColors`: maximum bitmap color reduction count.

### ACEParaBitmapToVector

- `Tolerance`: vector color grouping tolerance, 0-300.
- `Smoothing`: curve smoothing, 0-200.
- `DetermineBackgroundColor`: automatic outside background detection.
- `BackgroundColor`: RGB or hex color sent to ACE.
- `BackgroundFill`: whether background-colored internal regions are stitched.

### ACEParaBitmapToPunch

- `LineWidth`: 1/10 mm threshold for stitch lines.
- `SatinStitchWidth`: 1/10 mm satin/fill threshold.
- `Overlap`: 1/10 mm region overlap.
- `MinimumAreaSize`: square mm.
- `MinimumHoleSize`: square mm.
- `MinimumLineLength`: 1/10 mm.
- `UseThreadCones`: optional thread chart filename.

## Open Questions For ZSK

- Exact authentication header/value format.
- Whether ACE supports direct `CreateDST` in the customer's environment. Public ACE docs mention
  `CreatePNG` and `CreateTC`; the Lab currently converts TC to DST as a second request.
- Whether `UseThreadCones` expects filenames with `.json` or display names without extension in
  the target tenant. The parameter docs mention JSON filenames; one sample omits the extension.
