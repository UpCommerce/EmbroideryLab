# Melco state

## Status

- Provider: Melco Cloud AutoDigitize.
- Lab integration: backend connected in `providers/melco.mjs`.
- Real calls: enabled when `.env` has Melco API key and correct base URL.
- Current preferred environment for the key tested in Lab: sandbox.
- User clarified that Melco Live Designer / Configurator is not the target; Zakeke already handles customization. We only need API-based image-to-embroidery digitizing.

## API path used

Docs/demo used:

- https://apis.melcocloud.com/docs/index.html
- https://apis.melcocloud.com/apiservice/swagger/v1/swagger.json
- https://apis.melcocloud.com/demos/auto-digitization/index.html

Implemented flow:

1. Authenticate with `POST /auth/apikey`.
2. Call `POST /design-editor/digitize/metadata`.
3. Call `POST /design-editor/digitize/preview`.
4. In design mode, call `POST /design-editor/digitize/download`.
5. Save `melco-request.json`, `melco-source.json`, `melco-metadata.json`, preview and design files in the run.

## Auth/config needed

Do not commit actual keys.

Typical config:

```text
MELCO_CLOUD_API_BASE_URL=https://sandbox-apis.melcocloud.com
MELCO_CLOUD_API_KEY=...
MELCO_CLOUD_OUTPUT_FORMAT=ofm
```

The Lab follows demo auth:

- send `x-api-key`;
- body includes `api_key` and `device_info`;
- subsequent calls use `Authorization: melco {token}`.

## Current UI/backend options

Only options with real backend effect are exposed:

- `Use Melco default size`: when true, backend omits `new_width/new_height` and lets Melco choose size.
- Design format: OFM, DST, EXP.
- Common source preprocessing: max source side, min source side.

There are currently no public Melco auto-digitize options exposed for colors/stitch strategy, because the public endpoint we use only documents `image_file`, `new_width`, `new_height` and output format.

## Limits

Documented by Swagger for AutoDigitize endpoint:

- `multipart/form-data` input.
- File field: `image_file`.
- Optional query params: `new_width`, `new_height`, both integer.
- `metadata` returns JSON.
- `preview` and `download` return binary file.

Observed/demo behavior:

- Demo maps 1 inch to 254 units, so the Lab uses `mm * 10`.
- `Use Melco default size` can produce very different stitch count/physical output than forced width/height.
- Melco can return transient 503 upstream errors; backend should catch and continue comparisons.

Not publicly found yet:

- Supported input formats for `image_file`.
- Max file size in MB.
- Max pixel dimensions or megapixels.
- Max area/physical embroidery size.
- Timeout, rate limits, concurrency.
- Color reduction/stitch strategy options.
- Data retention/delete policy.

## Known issues / observations

- Some 400 errors have been tied to source constraints such as minimum image size. Lab now scales small images to at least 500 px on the short side by default.
- Some 503 errors appear server/upstream-side, not necessarily image-size errors.
- Need keep saving request, source-sent, response/error JSON for every run to debug vendor behavior.

## Next steps

1. Ask Melco for exact input limits: formats, MB, pixels, min/max physical size.
2. Ask whether there are hidden AutoDigitize options for color count, background, stitch style, trims or density.
3. Confirm production auth, rate/concurrency, SLA and retention policy.
4. Keep Melco default size true for compare by default unless testing size specifically.
