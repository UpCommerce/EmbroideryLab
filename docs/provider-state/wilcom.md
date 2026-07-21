# Wilcom state

## Status

- Provider: Wilcom EWA / AutoDigitizing API.
- Lab integration: backend connected in `providers/wilcom.mjs`.
- Real calls: enabled only when `.env` has Wilcom EWA credentials.
- No dry-run: if configured, `/api/convert` calls Wilcom for real.
- Main current risk: images with gradients/many small regions can fail with `Wilcom 151: The image is too complex for the AutoDigitizing API`.

## API path used

Official docs used:

- https://apiguide.wilcom.com/
- https://apiguide.wilcom.com/documents/api-interface-specification/limitations/
- https://apiguide.wilcom.com/documents/api-interface-specification/api-xml-data-package-definitions/auto-digitize-options-recipe-autodigitize_options-xml-data/

Implemented request flow:

- Bitmap preview: `POST /api/bitmapArtTrueview`.
- Bitmap design: `POST /api/bitmapArtDesign`.
- Vector preview: `POST /api/vectorArtTrueview`.
- Vector design: `POST /api/vectorArtDesign`.
- Body: form-url-encoded with `appId`, `appKey`, `requestXml`.
- Output artifacts saved in each `runs/<runId>/` directory.

## Auth/config needed

Do not commit actual keys.

Required env:

```text
WILCOM_EWA_APP_ID=...
WILCOM_EWA_APP_KEY=...
WILCOM_EWA_BASE_URL=https://public.ewa.wilcomapps.com
```

## Current UI/backend options

Wilcom options are provider-specific and are sent only for Wilcom:

- `inputKind`: auto, bitmap, vector.
- `useSourceDpi`: omits target width/height so Wilcom sizes from source DPI or 96 DPI fallback.
- `dpi`: output TrueView DPI.
- `designVersion`: only for EMB output.
- `colorSource`: default, palette, threadChart.
- `threads`: nominated thread colors, autopopulated from selected image and editable swatches.
- `threadChart`: `.tch` file sent as `thread_file`.
- `removeBackground`: Wilcom bitmap option.

Backend also has an optional hook, currently not exposed by default in UI:

- `simplifyBitmap=true`.
- `simplifyColors=2..256`, default 24.
- Produces `wilcom-source-simplified.png` and `wilcom-source-simplified.json` in the run.

## Limits

Documented hard limits:

- Request size: less than 20 MB.
- Auto digitize artwork: max 2 MB.
- Pixel count: max 5,000,000 px.
- Vector pixel count is calculated at 300 DPI.
- Area: max 22,500 mm2.
- Processing: max 90 seconds.

Lab conservative limits:

- Max Wilcom source pixels: 4,900,000.
- Target source bytes: 1,900,000.
- Area validated at 22,500 mm2.

No public numeric limit found for max colors or max regions. Error 151 suggests an internal complexity threshold.

## Known issues / open questions

- Need identify exact cause of Wilcom error 151: colors, small areas, object count, processing time, or combined score.
- Need ask Wilcom whether they expose preprocessing options such as maxColors, tolerance, minArea, smoothing.
- Need know recommended max thread colors for `<threads>`.
- Need confirm rate limits, concurrency, retry policy, pricing per call, retention/delete policy.

## Next steps

1. Add a visible Wilcom preprocessing experiment only if it has real backend effect.
2. Add per-run complexity metrics: exact/dominant colors, color clusters, alpha, gradient estimate, small regions estimate.
3. For failing images, run A/B tests: original, palette-reduced 24 colors, palette-reduced 12 colors, removed background, smaller target area.
4. Save comparison results into history and include the error category in provider evaluation.
## Wilcom support note: unsuitable image uploads (2022)

Source reviewed: `Wilcom API Support Note - Protect Your Website from Image-uploads Unsuitable for Embroidery.pdf`, dated 3 February 2022.

New documented guidance:

- Best input: logo/emblem artwork with clear boundaries and flat colors, without gradients.
- Wilcom describes `5-6` colors as a typical upper target for an efficient commercial logo. This is a production recommendation, not a documented API hard limit.
- Recommended source resolution: about `300 DPI` at the requested physical embroidery size.
- The AI needs roughly `3 px` of width to recognise a line in the source image. This is an image-recognition guideline, not a minimum sewable stitch width.
- Very small objects can be removed by AutoDigitizing as noise.
- Suggested upload area range: `100-22,500 mm2`. The Lab enforces the maximum but does not yet enforce the suggested minimum.
- Photographs should not be sent to this EWA workflow because it does not use the special techniques required for photo embroidery.
- Wilcom explicitly recommends filtering unsuitable uploads before the API call to avoid long failures, wasted capacity, API cost, and user frustration.

Development implications:

- Compute effective DPI from source pixels and requested millimetres. Upscaling alone must not be treated as recovered detail.
- Add preflight warnings for effective DPI below about 300, estimated strokes below 3 px, gradients, micro-regions, and likely photographs.
- Keep `5-6` colors as a warning/preset and A/B-test target, not as a universal rejection threshold.
- Add the suggested `100 mm2` minimum-area validation with a clear message.
- Save preflight metrics and the exact preprocessed image in each run so every frontend option has a real backend effect.
- For Wilcom 151 experiments, compare original, 24, 12, 8, and 6-color variants while keeping all other request options unchanged.

Standalone Italian translation and analysis: `docs/wilcom-image-upload-support-note-it.html`.
