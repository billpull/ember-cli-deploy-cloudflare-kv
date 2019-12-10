'use strict';

const fs = require('fs');
const path = require('path');
const RSVP = require('rsvp');

const denodeify = require('rsvp').denodeify;
const readFile  = denodeify(fs.readFile);

const DeployPluginBase = require('ember-cli-deploy-plugin');

const CloudflareClient = require('./lib/cloudflare');

module.exports = {
  name: require('./package').name,

  createDeployPlugin: function (options) {
    const DeployPlugin = DeployPluginBase.extend({
      name: options.name,

      defaultConfig: {
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

        cfClient: function(_context, pluginHelper) {
          const email = pluginHelper.readConfig('email');
          const apiKey = pluginHelper.readConfig('apiKey');
          const accountId = pluginHelper.readConfig('accountId');
          const namespace = pluginHelper.readConfig('namespace');

          return new CloudflareClient(email, apiKey, accountId, namespace);
        }
      },

      requiredConfig: ['accountId', 'email', 'apiKey', 'namespace'],

      upload: function(/* context */) {      
        const cfClient          = this.readConfig('cfClient');
        const distDir           = this.readConfig('distDir');
        const filePattern       = this.readConfig('filePattern');
        const keyPrefix         = this.readConfig('keyPrefix');
        const revisionKey       = this.readConfig('revisionKey');
        const filePath          = path.join(distDir, filePattern);
        const keyName           = `${keyPrefix}-${revisionKey}`;

        this.log(`Uploading \`${filePath}\``, { verbose: true });
        return this._readFileContents(filePath)
          .then((fileContents) => {
            return cfClient.fetch(keyName, 'PUT', fileContents);
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
        const cfClient                = this.readConfig('cfClient');
        const keyPrefix                = this.readConfig('keyPrefix');
        const revisionKey              = this.readConfig('revisionKey');
        const activationSuffix         = this.readConfig('activationSuffix');
        const activationContentSuffix  = this.readConfig('activationContentSuffix');
        const keyName                  = `${keyPrefix}-${revisionKey}`;
        const activationKey            = `${keyPrefix}-${activationSuffix}`;
        const activationContentKey     = `${keyPrefix}-${activationContentSuffix}`;

        this.log(`Activating revision \`${revisionKey}\``, { verbose: true });

        const contentResponse = await cfClient.fetch(keyName, 'GET');

        const body = await contentResponse.text();
        await cfClient.fetch(activationContentKey, 'PUT', body);

        await cfClient.fetch(activationKey, 'PUT', revisionKey);

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
        const cfClient          = this.readConfig('cfClient');
        const keyPrefix         = this.readConfig('keyPrefix');

        this.log(`Listing initial revisions for key: \`${keyPrefix}\``);

        const resp = await cfClient.getRevisions(keyPrefix);
        const revisionJson = await resp.json();
        const revisions = revisionJson ? revisionJson.revisions : [];

        this.log(revisions.toString(), { verbose: true });
      
        return revisions;
      },

      fetchRevisions: async function(/* context */) {
        const cfClient          = this.readConfig('cfClient');
        const keyPrefix         = this.readConfig('keyPrefix');

        this.log(`Listing revisions for key: \`${keyPrefix}\``);

        const resp = await cfClient.getRevisions(keyPrefix);
        const revisionJson = await resp.json();
        const revisions = revisionJson ? revisionJson.revisions : [];

        this.log(revisions.toString(), { verbose: true });
      
        return revisions;
      },

      _updateRevisionList: async function(revisionKey) {
        this.log(`Updating revision list with \`${revisionKey}\``, { verbose: true });
        const revisionBody = {};

        const cfClient                 = this.readConfig('cfClient');
        const keyPrefix                = this.readConfig('keyPrefix');

        const getRevisions = await cfClient.getRevisions(keyPrefix)

        if (getRevisions.ok) {
          const currentRevisions = await getRevisions.json();
          revisionBody.revisions = [...currentRevisions.revisions, revisionKey];
        } else {
          revisionBody.revisions = [revisionKey];
        }

        await cfClient.fetch(`${keyPrefix}-revisions`, 'PUT', JSON.stringify(revisionBody));
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
    });

    return new DeployPlugin();
  }
};