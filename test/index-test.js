const assert = require('assert');
const sandbox = require('sinon').createSandbox();

const stubProject = {
  name: function() {
    return "my-project";
  }
};

describe("cf-workers-kv plugin", function() {
  let subject, mockUi;

  beforeEach(function() {
    subject = require("../index");
    mockUi = {
      verbose: true,
      messages: [],
      write: function() {},
      writeLine: function(message) {
        this.messages.push(message);
      }
    };
  });

  afterEach(function() {
    sandbox.restore();
  });

  it("has a name", function() {
    var result = subject.createDeployPlugin({
      name: "test-plugin"
    });

    assert.equal(result.name, "test-plugin");
  });

  it("implements the correct hooks", function() {
    var plugin = subject.createDeployPlugin({
      name: "test-plugin"
    });
    assert.ok(plugin.configure);
    assert.ok(plugin.upload);
    assert.ok(plugin.activate);
    assert.ok(plugin.didDeploy);
  });

  describe("configure hook", function() {
    it("runs without error if config is ok", function() {
      var plugin = subject.createDeployPlugin({
        name: 'cloudflare-kv'
      });

      var context = {
        ui: mockUi,
        project: stubProject,
        config: {
          'cloudflare-kv': {
            accountId: 1234,
            email: 'test-kv@example.com',
            apiKey: 'test-kv-apiKey',
            namespace: 'test-kv1234'
          }
        }
      };
      plugin.beforeHook(context);
      plugin.configure(context);
      assert.ok(true); // didn't throw an error
    });
  });

  describe("resolving revisionKey from the pipeline", function() {
    it("uses the config data if it already exists", function() {
      var plugin = subject.createDeployPlugin({
        name: 'cloudflare-kv'
      });

      var config = {
        accountId: 1234,
        email: 'test-kv@example.com',
        apiKey: 'test-kv-apiKey',
        namespace: 'test-kv1234',
        revisionKey: '12345'
      };
      var context = {
        ui: mockUi,
        project: stubProject,
        config: {
          'cloudflare-kv': config
        },
        revisionData: {
          revisionKey: "something-else"
        }
      };

      plugin.beforeHook(context);
      plugin.configure(context);
      assert.equal(plugin.readConfig("revisionKey"), "12345");
    });

    it("uses the commandOptions value if it exists", function() {
      var plugin = subject.createDeployPlugin({
        name: "cloudflare-kv"
      });

      var config = {
        accountId: 1234,
        email: 'test-kv@example.com',
        apiKey: 'test-kv-apiKey',
        namespace: 'test-kv1234',
      };
      var context = {
        ui: mockUi,
        project: stubProject,
        config: {
          'cloudflare-kv': config
        },
        commandOptions: {
          revision: "abcd"
        },
        revisionData: {
          revisionKey: "something-else"
        }
      };

      plugin.beforeHook(context);
      plugin.configure(context);
      assert.equal(typeof config.revisionKey, "function");
      assert.equal(config.revisionKey(context), "abcd");
    });

    it("uses the context value if it exists and commandOptions doesn't", function() {
      var plugin = subject.createDeployPlugin({
        name: 'cloudflare-kv'
      });

      var config = {
        accountId: 1234,
        email: 'test-kv@example.com',
        apiKey: 'test-kv-apiKey',
        namespace: 'test-kv1234',
      };
      var context = {
        ui: mockUi,
        project: stubProject,
        config: {
          'cloudflare-kv': config
        },
        commandOptions: {},
        revisionData: {
          revisionKey: "something-else"
        }
      };

      plugin.beforeHook(context);
      plugin.configure(context);
      assert.equal(typeof config.revisionKey, "function");
      assert.equal(config.revisionKey(context), "something-else");
    });
  });
});