# Melco Cloud provider notes

## Current state

Melco has a public Swagger portal and an Auto Digitization demo:

```text
https://apis.melcocloud.com/docs/index.html
https://apis.melcocloud.com/demos/auto-digitization/index.html
```

The URL fragment `#/Configurator` points to the Fusion configurator/session API. That flow is product/session based and is not the right first target for Zakeke, because Zakeke is already the visual customizer.

For our use case, the relevant flow is the demo-backed AutoDigitize API:

```text
image_file -> metadata / preview / production file
```

## Environments

The demo exposes three environments:

```text
Test:       https://test-apis.melcocloud.com
Sandbox:    https://sandbox-apis.melcocloud.com
Production: https://apis.melcocloud.com
```

The current test API key is valid on sandbox, so local `.env` should use:

```text
MELCO_CLOUD_API_BASE_URL=https://sandbox-apis.melcocloud.com
```

Do not put real keys in `.env.example` or commits.

## Relevant AutoDigitize endpoints

Base URL is the environment root, not `/apiservice`:

```text
https://sandbox-apis.melcocloud.com
```

Endpoints:

```text
POST /auth/apikey
POST /design-editor/digitize/metadata
POST /design-editor/digitize/preview
POST /design-editor/digitize/download
```

The digitize endpoints accept:

```text
multipart/form-data
field: image_file
query: new_width, new_height
```

The download endpoint also accepts:

```text
query: format=OFM|DST|EXP
```

The Lab has one Melco-specific UI option:

- `Use Melco default size`: when enabled, the backend omits `new_width` and `new_height` completely, so Melco chooses the output size from the artwork/account defaults. This is not a frontend-only option; it changes the API request.

The demo maps `1 Inch` to `254`, `2 Inch` to `508`, etc. Therefore the Lab converts mm to Melco units with:

```text
melco_units = mm * 10
```

because 25.4 mm equals 254 Melco units.

## Authentication

The demo authenticates with:

```http
x-api-key: {api_key}
```

and body:

```json
{
  "api_key": "...",
  "device_info": {
    "name": "browser"
  }
}
```

The auth response includes `token`. The demo then sends subsequent calls with:

```http
x-api-key: {api_key}
Authorization: melco {token}
```

The Lab follows this automatically when `MELCO_CLOUD_API_KEY` is present and no explicit auth token/header is configured.

## Required configuration

```text
MELCO_CLOUD_API_BASE_URL=https://sandbox-apis.melcocloud.com
MELCO_CLOUD_API_KEY=
MELCO_CLOUD_AUTH_HEADER=
MELCO_CLOUD_AUTH_TOKEN=
MELCO_CLOUD_OUTPUT_FORMAT=ofm
```

Normally only these are needed:

```text
MELCO_CLOUD_API_BASE_URL=https://sandbox-apis.melcocloud.com
MELCO_CLOUD_API_KEY=...
```

If Melco gives a token directly, the Lab also supports:

```text
MELCO_CLOUD_AUTH_HEADER=melco ...
```

or:

```text
MELCO_CLOUD_AUTH_TOKEN=...
```

If the token has no scheme, the Lab sends it as `melco {token}`.

## Implemented Lab flow

For `TrueView` mode:

1. authenticate through `/auth/apikey`;
2. call `/design-editor/digitize/metadata`;
3. save `melco-metadata.json`;
4. call `/design-editor/digitize/preview`;
5. save the PNG returned by Melco.

For `Design file` mode:

1. run the same metadata + preview calls;
2. call `/design-editor/digitize/download?format=OFM|DST|EXP`;
3. save the production file returned by Melco.

The demo reads the output filename from the `x-filename` response header. The Lab supports `x-filename` and `Content-Disposition`, with fallback names such as `melco-design.dst`.

## Verified result

Using the sandbox API key and `public/samples/example.png`, Melco returned with forced 90 x 45 mm sizing:

```text
preview: example.png
DST:     example.DST
stitches: 1828
colors:   4
trims:    9
```

With `Use Melco default size` enabled, the request omitted `new_width` and `new_height`; Melco returned a different preview and metadata:

```text
stitches: 11336
colors:   4
width:    1656 Pixels
height:   2206 Pixels
```

## What we still need from Melco

- Pricing and commercial/SaaS terms.
- Rate limits and fair-use limits for sandbox/production.
- Supported input formats and max file dimensions/size.
- Whether production keys are separate from sandbox keys.
- Data retention/delete policy for uploaded artwork.
- Whether `metadata.width/height` can return physical units instead of pixels, or if the physical size is only controlled through `new_width/new_height`.

## Configurator note

Configurator endpoints exist in the Fusion spec, for example:

```text
GET /configurator/sessions/start
PUT /configurator/sessions/{session_Id}
GET /configurator/sessions/{session_id}/preview
GET /configurator/sessions/{session_id}/download
```

Those are useful only if we decide to test Melco's product/session personalization workflow. They are not the primary route for `Zakeke artwork -> embroidery digitizing`.
