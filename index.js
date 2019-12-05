'use strict';

const fs = require('fs');
const path = require('path');
const RSVP = require('rsvp');
const fetch = require('node-fetch');

const denodeify = require('rsvp').denodeify;
const readFile  = denodeify(fs.readFile);

const DeployPluginBase = require('ember-cli-deploy-plugin');

const CF_URL = 'https://api.cloudflare.com/client/v4/accounts';

module.exports = {
  name: require('./package').name,

  createDeployPlugin: function (options) {
    const DeployPlugin = DeployPluginBase.extend({
      name: options.name,

      defaultConfig: {
        urlPrefix: CF_URL,
        filePattern: 'index.html',
        activationSuffix: 'current',
        activationContentSuffix: 'current-content',

        distDir: function(context) {
          return context.distDir;
        },

        didDeployMessage: function(context){
          const revisionKey = context.revisionData && context.revisionData.revisionKey;
          const activatedRevisionKey = context.revisionData && context.revisionData.activatedRevisionKey;
          if (revisionKey && !activatedRevisionKey) {
            return `Deployed but did not activate revision ${revisionKey}. 
                    To activate, run: ember deploy:activate ${context.deployTarget} --revision=${revisionKey}`;
          }
        },

        revisionKey: function(context) {
          return context.commandOptions.revision || (context.revisionData && context.revisionData.revisionKey);
        },

        revisionData: function(context) {
          return context.revisionData;
        },

        keyPrefix: function(context) {
          return `${context.project.name()}-index`;
        },

        cfHeaders: function(context, pluginHelper) {
          return {
            'X-Auth-Email': pluginHelper.readConfig('email'),
            'X-Auth-Key': pluginHelper.readConfig('apiKey')
          };
        }
      },

      requiredConfig: ['accountId', 'email', 'apiKey', 'namespace'],

      upload: function(/* context */) {      
        const urlPrefix         = this.readConfig('urlPrefix');
        const cfHeaders         = this.readConfig('cfHeaders');
        const accountId         = this.readConfig('accountId');
        const namespace         = this.readConfig('namespace');
        const distDir           = this.readConfig('distDir');
        const filePattern       = this.readConfig('filePattern');
        const keyPrefix         = this.readConfig('keyPrefix');
        const revisionKey       = this.readConfig('revisionKey');
        const filePath          = path.join(distDir, filePattern);
        const keyName           = `${keyPrefix}-${revisionKey}`;

        this.log(`Uploading \`${filePath}\``, { verbose: true });
        return this._readFileContents(filePath)
          .then((fileContents) => {
            return fetch(`${urlPrefix}/${accountId}/storage/kv/namespaces/${namespace}/values/${keyName}`, {
              method: 'PUT',
              headers: cfHeaders,
              body: fileContents
            });
          })
          .then(() => {
            this.log(`Uploaded with key \`${keyName}\``, { verbose: true });
          })
          .then(this._updateRevisionList(revisionKey))
          .catch(this._errorMessage.bind(this));
      },

      willActivate: function(/* context */) {
        return RSVP.resolve();
      },

      activate: async function(/* context */) {
        const urlPrefix                = this.readConfig('urlPrefix');
        const cfHeaders                = this.readConfig('cfHeaders');
        const accountId                = this.readConfig('accountId');
        const namespace                = this.readConfig('namespace');
        const keyPrefix                = this.readConfig('keyPrefix');
        const revisionKey              = this.readConfig('revisionKey');
        const activationSuffix         = this.readConfig('activationSuffix');
        const activationContentSuffix  = this.readConfig('activationContentSuffix');
        const keyName                  = `${keyPrefix}-${revisionKey}`;
        const activationKey            = `${keyPrefix}-${activationSuffix}`;
        const activationContentKey     = `${keyPrefix}-${activationContentSuffix}`;

        this.log(`Activating revision \`${revisionKey}\``, { verbose: true });

        const contentResponse = await this._fetchReq(`${urlPrefix}/${accountId}/storage/kv/namespaces/${namespace}/values/${keyName}`, {
          method: 'GET',
          headers: cfHeaders
        });

        const body = await contentResponse.text();
        await this._fetchReq(`${urlPrefix}/${accountId}/storage/kv/namespaces/${namespace}/values/${activationContentKey}`, {
          body,
          method: 'PUT',
          headers: cfHeaders,
        });

        await this._fetchReq(`${urlPrefix}/${accountId}/storage/kv/namespaces/${namespace}/values/${activationKey}`, {
          method: 'PUT',
          headers: cfHeaders,
          body: revisionKey
        });

        this.log(`✔ Activated revision \`${revisionKey}\``);

        return RSVP.resolve({
          revisionData: {
            activatedRevisionKey: revisionKey
          }
        });
      },

      didDeploy: function(/* context */){
        const didDeployMessage = this.readConfig('didDeployMessage');
        if (didDeployMessage) {
          this.log(didDeployMessage);
        }
      },

      fetchInitialRevisions: async function() {
        const urlPrefix         = this.readConfig('urlPrefix');
        const cfHeaders         = this.readConfig('cfHeaders');
        const accountId         = this.readConfig('accountId');
        const namespace         = this.readConfig('namespace');
        const keyPrefix         = this.readConfig('keyPrefix');

        this.log(`Listing initial revisions for key: \`${keyPrefix}\``);
        const getInitialRevisions = await this._fetchReq(`${urlPrefix}/${accountId}/storage/kv/namespaces/${namespace}/values/${keyPrefix}-revisions`, {
            method: 'GET',
            headers: cfHeaders
          });
        
        const revisionJson = await getInitialRevisions.json();
        const revisions = revisionJson ? revisionJson.revisions : [];
        this.log(revisions.toString(), { verbose: true });
      
        return revisions;
      },

      fetchRevisions: async function(/* context */) {
        const urlPrefix         = this.readConfig('urlPrefix');
        const cfHeaders         = this.readConfig('cfHeaders');
        const accountId         = this.readConfig('accountId');
        const namespace         = this.readConfig('namespace');
        const keyPrefix         = this.readConfig('keyPrefix');

        this.log(`Listing revisions for key: \`${keyPrefix}\``);
        const getRevisions = await this._fetchReq(`${urlPrefix}/${accountId}/storage/kv/namespaces/${namespace}/values/${keyPrefix}-revisions`, {
            method: 'GET',
            headers: cfHeaders
          });

        const revisionJson = await getRevisions.json();
        const revisions = revisionJson ? revisionJson.revisions : [];
        this.log(revisions.toString(), { verbose: true });
      
        return revisions;
      },

      _updateRevisionList: async function(revisionKey) {
        this.log(`Updating revision list with \`${revisionKey}\``, { verbose: true });
        const revisionBody = {};

        const urlPrefix                = this.readConfig('urlPrefix');
        const cfHeaders                = this.readConfig('cfHeaders');
        const accountId                = this.readConfig('accountId');
        const namespace                = this.readConfig('namespace');
        const keyPrefix                = this.readConfig('keyPrefix');
        const getRevisions = await this._fetchReq(`${urlPrefix}/${accountId}/storage/kv/namespaces/${namespace}/values/${keyPrefix}-revisions`, {
          method: 'GET',
          headers: cfHeaders,
        });

        if (getRevisions.ok) {
          const currentRevisions = await getRevisions.json();
          revisionBody.revisions = [...currentRevisions.revisions, revisionKey];
        } else {
          revisionBody.revisions = [revisionKey];
        }

        await this._fetchReq(`${urlPrefix}/${accountId}/storage/kv/namespaces/${namespace}/values/${keyPrefix}-revisions`, {
          method: 'PUT',
          headers: cfHeaders,
          body: JSON.stringify(revisionBody)
        });
      },

      _readFileContents: function(path) {
        return readFile(path)
          .then(function(buffer) {
            return buffer.toString();
          });
      },

      _errorMessage: function(error) {
        this.log(error, { color: 'red' });
        return RSVP.reject(error);
      },

      _fetchReq: function (url, options) {
        return fetch(url, options)
          .catch(err => {
            return this._errorMessage(err.message);
          });
      }
    });

    return new DeployPlugin();
  }
};
