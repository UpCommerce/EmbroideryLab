# ZSK state

## Status

- Provider: ZSK ACE via embroidery-api.com / ZSK Web API tenant.
- Lab integration: backend connected in `providers/zsk.mjs` for ACE-style image-to-embroidery requests.
- Real calls: blocked until we have tenant base URL, API key and ACE license enabled.
- User asked whether ACE or classic Web API is correct. Conclusion: ACE is the right path for our goal because it creates embroidery data from image data; classic Web API is more about existing embroidery, text/monogram/render/conversion flows.

## API path used/planned

Docs used:

- https://www.embroidery-api.com/
- https://www.embroidery-api.com/api/ACE
- https://www.embroidery-api.com/api/ACE/section/ExampleRequest
- https://www.embroidery-api.com/api/ACE/section/ACEParaBitmapOptimize
- https://www.embroidery-api.com/api/ACE/section/ACEParaBitmapToVector
- https://www.embroidery-api.com/api/ACE/section/ACEParaBitmapToPunch
- https://www.embroidery-api.com/api/ZSKWebApi/section/JobResponseType

Implemented payload style:

- Endpoint default: `/StitchJob`.
- Header default: `x-api-key`.
- Payload includes `Client: "ACE"`.
- Preview mode uses `RequestType: "CreatePNG"`.
- Design mode uses `CreatePNG` for preview, then `CreateTC` for embroidery data.
- If requested output is DST, Lab attempts a second conversion from TC to DST.

## Auth/config needed

Do not commit actual keys.

Expected config:

```text
ZSK_WEB_API_BASE_URL=https://renderer.zsk.de/ZskWebApiService.svc
ZSK_WEB_API_KEY=...
ZSK_WEB_API_AUTH_HEADER=
ZSK_WEB_API_AUTH_SCHEME=
ZSK_WEB_API_ENDPOINT=/StitchJob
ZSK_ACE_TOKEN=
ZSK_ACE_THREAD_CONES=
```

What to ask ZSK:

- Whether the provided ZSK Web API license is also valid as `ACEToken`.
- If not, the separate ACE token value.
- Confirmation that ACE license is active for `CreatePNG` and `CreateTC`.
- Whether authentication should be payload-only (`WebApiLicense`) or also use an HTTP header.

## Current UI/backend options

ZSK options map to documented ACE blocks:

`ACEParaBitmapOptimize`:

- `ImageType`: clipart/scanned/highlight variants.
- `Tolerance`: 0-300, default 150.
- `RemoveArea`: 0-200, default 60.
- `MaxColors`: default 24; Lab validation currently allows 1-256.

`ACEParaBitmapToVector`:

- `Tolerance`: 0-300.
- `Smoothing`: 0-200.
- `DetermineBackgroundColor`.
- `BackgroundColor`.
- `BackgroundFill`.

`ACEParaBitmapToPunch`:

- `LineWidth`.
- `SatinStitchWidth`.
- `Overlap`.
- `MinimumAreaSize`.
- `MinimumHoleSize`.
- `MinimumLineLength`.
- `UseThreadCones`.

## Limits

Documented input:

- `PictureType`: PNG, JPG, BMP.
- `PictureBase64`: base64 image.

Documented output/request types:

- `CreatePNG`.
- `CreateTC`.

Documented color/complexity controls:

- `Resolution`: DPI; if absent, bitmap DPI is used.
- `ImageType`: clipart/scanned variants.
- `Tolerance`: color grouping in RGB space, 0-300.
- `RemoveArea`: removes small regions, 0-200, in 1/100000 of total area.
- `MaxColors`: default 24.

Not publicly found yet:

- Max request/base64 size.
- Max file size in MB.
- Max pixel dimensions or megapixels.
- Max physical area.
- Timeout, rate limits, concurrency.
- Whether direct `CreateDST` is available in a given ACE tenant.
- Full thread cone chart list for the tenant.

## Known issues / observations

- We have not run a real ZSK ACE conversion yet because tenant/API key are missing.
- The public docs are enough to shape the request, but real endpoint/auth and license are customer-specific.
- ACE looks promising for handling gradients/complex images because it exposes color reduction and small-area removal options directly.
- On 2026-06-18 the endpoint accepted raw/text payload format, but returned `ACEToken is missing`.
- Using the same value as both `WebApiLicense` and `ACEToken` returned `Invalid or expired token`.
- Therefore the current blocker is a separate valid `ZSK_ACE_TOKEN`.

## Next steps

1. Confirm whether a separate ACE token is required.
2. Run first `CreatePNG` test with a simple PNG/JPG/BMP.
3. Run `CreateTC` and then DST conversion if needed.
4. Compare ACE `MaxColors`, `Tolerance`, `RemoveArea`, `ImageType` against Wilcom/Pulse/Melco on the same source image.
