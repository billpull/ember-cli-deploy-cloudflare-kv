const assert = require('assert');
const CloudflareClient = require('../lib/cloudflare');

describe("Cloudflare client", function() {
    describe("KV namespace", function () {
        it("defaults to kv-asset-handler", function () {
            const client = new CloudflareClient("bill@example.com", "123", "321");
            assert.equal(client.namespace, "__STATIC_CONTENT");
        });

        it("allows overrides", function () {
            const client = new CloudflareClient("bill@example.com", "123", "321", "test-kv-namespace");
            assert.equal(client.namespace, "test-kv-namespace");
        })
    });
});