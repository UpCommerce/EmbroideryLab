# Melco Fusion provider notes

## Current state

Melco Fusion appears to be a token-based e-commerce personalization and fulfillment system, not a public one-shot bitmap-to-embroidery conversion API. The public API documentation exposes client-side personalization and fulfillment calls for already-created Fusion "Ready" products and personalization tokens.

The provider therefore does not pretend to auto-digitize arbitrary uploads. It writes `melco-request.json` for every run, fails fast when Fusion credentials/token are missing, and can fetch real Fusion fulfillment artifacts when supplied with a valid personalization token.

## Sources checked

- Melco software page: states Fusion is a cloud web service that generates product previews and embroidery-ready files from e-commerce user data. https://melco.com/melco-software/
- Melco Fusion UK page: states Fusion has a REST API and pre-built Shopify/Shopware integrations. https://melco.com/en-gb/melco-fusion/
- LiveDesigner Fusion getting started: documents use of hosted `melco.js`, `Melco.LoadPersonalization(username, readyToken)`, `Melco.CompletePersonalization`, and token-based `Token/GetImage`. https://admin.livedesignerfusion.com/Documentation/api/GetStarted
- LiveDesigner Fusion JavaScript API: documents personalization result objects, element metadata, stitch counts, colors, and token capture. https://admin.livedesignerfusion.com/Documentation/api/JavaScriptAPI
- LiveDesigner Fusion TokenFulfillment API: documents authenticated fulfillment archive, definition, file, and preview endpoints. https://admin.livedesignerfusion.com/Documentation/api/TokenFulfillment
- Melco supported file types: identifies `.OFM` as the preferred Melco machine design format and links OS/DesignShop format support. https://melco.zendesk.com/hc/en-us/articles/360018337572-Supported-File-Types
- AMAYA OS save formats: lists Melco project `.ofm`, condensed `.cnd`, expanded `.exp`, and other machine/home formats. https://www.melco-service.com/docs/AMAYA_OS_v10/DesignView/File_save.htm

## Public endpoint shape

Base URL:

```text
https://client.livedesignerfusion.com
```

Documented fulfillment endpoints:

```text
/{username}/TokenFulfillment/GetDefinition
/{username}/TokenFulfillment/GetArchive
/{username}/TokenFulfillment/GetFile
/{username}/TokenFulfillment/GetfulfillmentPreview
```

Important documented parameters:

- `Token`: personalization token returned by `Melco.CompletePersonalization`.
- `EmbFormat`: `ofm`, `exp`, or `dst` for `GetArchive`.
- `VectorFormat`: `svg`, `svgz`, `png`, or `eps` for `GetArchive`.
- `FulfillmentID`: required by `GetFile` and `GetfulfillmentPreview`; obtained from `GetDefinition`.
- `FileName`: required by `GetFile`; extension controls requested output format.
- `DPI`, `RotAng`, `FabricStyle`, `IncludeAllElements`, `RecalculateStitches`.

The docs state the fulfillment calls must be authenticated, but the public page does not document the exact auth scheme. The provider accepts an explicit full `Authorization` header so we do not bake in an unverified Basic/Bearer assumption.

## Required configuration

```text
MELCO_FUSION_USERNAME=
MELCO_FUSION_AUTH_HEADER=
MELCO_FUSION_TOKEN=
MELCO_FUSION_BASE_URL=https://client.livedesignerfusion.com
```

`MELCO_FUSION_TOKEN` can be omitted if the caller passes `options.melco.token`.

Needed from Melco/account owner before full integration:

- Fusion account username.
- Documented authentication scheme or a working full `Authorization` header value.
- A Ready token and JS integration flow to create personalization tokens.
- Confirmation whether a private upload/autodigitize API exists for raw bitmap/SVG inputs.
- Fabric style reference IDs and allowed hoop/product setup for target Zakeke workflows.

## Provider options

Recommended UI options under `options.melco`:

```json
{
  "mode": "archive",
  "token": "",
  "fulfillmentId": "",
  "fileName": "melco-design.ofm",
  "embFormat": "ofm",
  "vectorFormat": "png",
  "dpi": 300,
  "previewWidth": 900,
  "previewMaxHeight": 0,
  "rotateDegrees": "",
  "fabricStyle": "",
  "includeAllElements": false,
  "recalculateStitches": false
}
```

Modes:

- `definition`: fetches token fulfillment metadata as `melco-definition.json`.
- `archive`: downloads `melco-fulfillment.zip` containing production files and information.
- `file`: downloads one fulfillment file; requires `fulfillmentId`.
- `preview`: downloads one fulfillment preview image; requires `fulfillmentId`.

## Supported output formats

From public Fusion TokenFulfillment docs:

- Embroidery: `ofm`, `exp`, `dst`
- Vector/raster archive components: `svg`, `svgz`, `png`, `eps`

Recommended default is `ofm` because Melco documents OFM as the preferred design file type for its embroidery machines. Use `exp` or `dst` when the downstream comparison needs machine-expanded output or cross-provider parity.
