# PulseID state

## Status

- Provider: PulseID / Tajima Pulse web API.
- Lab integration: backend connected in `providers/pulseid.mjs`.
- Real calls: enabled by default against the configured PulseID base URL.
- No dry-run: `/api/convert` uploads and autodigitizes for real.
- This is currently one of the easiest providers to test without a commercial onboarding block.

## API path used

Docs used:

- https://webapi.pulseidconnect.com/Documentation/Autodigitize
- https://webapi.pulseidconnect.com/Documentation/Render
- https://webapi.pulseidconnect.com/Documentation/GetInfo
- https://webapi.pulseidconnect.com/Documentation/Generate

Implemented flow:

1. Upload source image to PulseID Upload API.
2. Call GetInfo/Autodigitize with the same digitizing params and save `pulseid-getinfo-response.json`.
3. For preview: call Render/Autodigitize and save `pulseid-preview.png`.
4. For design file: call Generate/Autodigitize and save `pulseid-design.<format>` plus preview, only when Pulse run type is Full conversion.
5. Save request and response artifacts in `runs/<runId>/`.

## Auth/config needed

Current Lab config:

```text
PULSEID_BASE_URL=https://webapi.pulseidconnect.com
```

No API key is currently wired in the Lab. If Pulse/Tajima provides a tenant-specific/authenticated endpoint, add env vars before production evaluation.

## Current UI/backend options

Pulse options are provider-specific and are sent only for Pulse:

- Run type: Full conversion or Quick estimate + preview. Quick calls GetInfo and a smaller Render preview, then skips production file generation even in Design mode.
- `TimeoutSeconds`: defaults to 60 for full conversion and 20 for quick estimate unless edited.
- `ThreadType`: polyester, rayon, cotton, nylon, metallic.
- `ThreadThickness`: default 5 mm in Pulse docs, supported 1-99 mm.
- `IgnoreSmallAreas`.
- `CreateSatinAndSteil`.
- `AddSteilBorders`.
- `StitchInnerBackground`.
- `SequenceType`: none, min colors, min jumps, smart.
- `TrimType`: never, always, trim at.
- `LockType`.
- `TrimThreshold`.
- `MaximumRunWidth`, `MaximumSatinWidth`, `MaximumSteilWidth`.
- `NumColors`.
- `Recipe`.
- `ProportionalResize`.
- `LightenShadows`.
- `UseImageDimensions`.
- Render options: width, height, padding, transparent background. Quick estimate defaults these to 360 x 360 px with 20 px padding.
- GetInfo metrics mapped into Lab result metrics: stitches, trims, colors and dimensions. Raw stops/palette stay in the saved GetInfo response.

There is also a dedicated task/flow in the UI for comparing 5 thread types on the same image while keeping the rest as default.

## Limits

Documented input formats:

- Bitmap: BMP, JPG, PNG, TIF, PCX, MAC, PCD, TGA.
- Vector: CDR, CMX, EMF, WMF, EPS, AI.

Documented output:

- Preview/render: PNG, JPG, JPEG.
- Production: PXF, DST, TCF, PES, Z00, PCF.

Documented parameters/constraints:

- `ThreadThickness`: 1-99 mm.
- `TimeoutSeconds`: default 60 seconds in docs.
- `NumColors`: if lower than original colors, Pulse tries reduction; if higher than original colors, it can throw an exception.
- Default segment width logic:
  - 1-5 points: run stitch.
  - 6-15 points: steil stitch.
  - 15-70 points: satin column.
  - 70+ points: complex fill.

Not publicly found yet:

- Max upload size in MB.
- Max pixel dimensions or megapixels.
- Max area/physical embroidery size.
- Rate limits and concurrency.
- Data retention/delete policy.

## Known issues / observations

- GetInfo works on Autodigitize and returns `NumStitches`, `NumTrims`, dimensions, palette, stops and thread usage.
- Preview can show returned JSON or text if Pulse returns an error payload instead of binary; backend now tries to catch text-like error responses.
- Source size matters for visual framing; common preprocessing now normalizes all providers, not only Melco.
- Pulse often produces results where Wilcom rejects complex artwork, likely because Pulse has more permissive or different internal simplification.

## Next steps

1. Continue systematic option comparisons, starting with thread type.
2. Add option comparison batches for `NumColors`, `IgnoreSmallAreas`, and segment width thresholds.
3. Ask Pulse/Tajima for production auth, rate limits, upload limits, SaaS terms and retention policy.
4. Add per-run metrics to correlate Pulse results with source complexity and option choices.
5. Ask Pulse/Tajima whether there is an undocumented lighter simulation endpoint; the public Simulate documentation link currently returns 404.
