'use strict';

const CoreObject = require('core-object');
const fetch = require('node-fetch');

const CF_URL = 'https://api.cloudflare.com/client/v4/accounts';

const CloudFlareCient = CoreObject.extend({
    accountId: null,
    namespace: null,

    headers: {},

    baseUrl: null,

    init(email, apiKey, accountId, namespace)  {
        this.accountId = accountId;
        this.namespace = namespace;
        this.headers = {
            'X-Auth-Key': apiKey,
            'X-Auth-Email': email,
        }

        this.baseUrl = `${CF_URL}/${this.accountId}/storage/kv/namespaces/${this.namespace}/values`;
    },

    _buildURL(key) {
        return `${this.baseUrl}/${key}`;
    },

    async fetch(key, method, body,) {
        const options = {
            method,
            headers: this.headers
        };

        if (body) {
            options.body = body;
        }

        return await fetch(this._buildURL(key), options);
    },

    async getRevisions(revision) {
        return await this.fetch(`${revision}-revisions`, 'GET');
    }
});

module.exports = CloudFlareCient;