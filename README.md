ember-cli-deploy-cloudflare-kv
==============================================================================

Uploads the contents of a file, `dist/index.html` by default, to a Cloudflare
Worker's KeyValue store.

Inspired by [ember-cli-deploy-redis](https://github.com/ember-cli-deploy/ember-cli-deploy-redis)

Installation
------------------------------------------------------------------------------

```
ember install ember-cli-deploy-cloudflare-kv
```


Usage
------------------------------------------------------------------------------

## Required configuration:

- accountId: Cloudflare account ID.
- email: The email associated with the provided Cloudflare account.
- apiKey: An API key granting access to the account & namespace.

These configuration options need to be set in `config/deploy.js` within `ENV['cloudflare-kv']`.

## Optional Configuration

### Namespace

The KV namespace your application will publish to. Defaults to `__STATIC_CONTENT` used by [`getAssetFromKV`](https://github.com/cloudflare/kv-asset-handler/blob/3949c2481190485ab2c5779031e4dae322a155c6/src/index.ts#L75)

### urlPrefix

The URL for the Cloudflare API. Defaults to `https://api.cloudflare.com/client/v4/accounts`.

### filePattern

Which file from the `dist` directory you wish to upload to your namespace. Defaults to `index.html`.

### activationSuffix

The suffix of the activated revision key. Defaults to `current`.

### activationContentSuffix

The suffix of the content of the activated revision. Defaults to `current-content`.

### distDir

Location of your application's build output. Defaults to `context.distDir`.

### didDeployMessage

A message to display after deployment has finished.

### revisionKey

The unique revision that will be used to reference the deployment. Defaults to `context.commandOptions.revision || context.revisionData.revisionKey`.

### revisionData

Metadata about the revision being uploaded. (normally provided by a plugin like [ember-cli-deploy-revision-data](https://github.com/ember-cli-deploy/ember-cli-deploy-revision-data))

### keyPrefix

The prefix used in the KV for each revision. Defaults to `context.project.name() + '-index'`.


License
------------------------------------------------------------------------------

This project is licensed under the [MIT License](LICENSE.md).
