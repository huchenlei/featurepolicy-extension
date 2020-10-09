'use strict';

/**
 * Returns the list of all features policies supported in the browser.
 * Note: Running this in the context of the background page mimics getting the
 * list on about:blank, which will return all the policies supported by the
 * browser (and not just the ones supported by the inspected page).
 */

const FP_HEADER = 'Feature-Policy';
const PP_HEADER = 'Permissions-Policy';

const connections = new Map();

function log(msg) {
  console.log(msg);
}

function getAllPermissionsPolicies() {
  const permissionsPolicy = document.policy || document.permissionsPolicy || document.featurePolicy;
  return permissionsPolicy.allowedFeatures();
}

async function getCurrentTab() {
  return new Promise(resolve => {
    chrome.tabs.query({active: true}, tab => resolve(tab[0]));
  });
}

function setPolicyManager(tabId, policyManager) {
  const connection = connections.get(tabId);
  if (connection) {
    connection.policyManager = policyManager;
  }
}

class FeaturePolicyHeader {
  /**
   * @param {Map<string, string[]>} policies
   */
  constructor(policies) {
    this.policies = policies;
  }

  /**
   * Parse Feature-Policy header string
   *
   * @param {string} header_string e.g. unsized-images 'none'; geolocation *; usb foo.com bar.com
   * @returns {FeaturePolicyHeader}
   */
  static parse(header_string) {
    return new FeaturePolicyHeader(header_string.split(';')
      .reduce((acc, item) => {
        const [policyName, ...allowlist] = item.trim().split(' ').filter(s => s !== '');
        acc[policyName] = allowlist;
        return acc;
      }, Map()));
  }

  serialize() {
    return [...this.policies.entries()]
      .map(([policyName, allowlist]) => `${policyName} ${allowlist.join(' ')}`)
      .join('; ');
  }
};

class PermissionsPolicyHeader {
  /**
   * @param {Map<string, string[]>} policies
   */
  constructor(policies) {
    this.policies = policies;
  }
  /**
   * Parse Permissions-Policy header string.
   *
   * Note: Permissions-Policy header uses Dictionary in [structured header syntax]
   *(https://httpwg.org/http-extensions/draft-ietf-httpbis-header-structure.html).
  *
  * Note: This function does not provide full structured header syntax parsing.
  * When incomplete syntax is received, it can lead to unexpected behaviour.
  *
  * @param {string} header_string e.g. p1=(), p2=("foo.com" "bar.com"), p3=self
  * @returns {PermissionsPolicyHeader}
  */
  static parse(header_string) {
    return new PermissionsPolicyHeader(header_string.split(',')
      .reduce((acc, item) => {
        const [policyName, allowlist_string] = item.split('=').filter(s => s !== '');
        const match_result = allowlist_string.match(/\((.*)\)/g);
        // Bracket is optional when there is only single item in SH's dictionary
        // value.
        const allowlist = match_result ?
          match_result[1].split(' ') : [allowlist_string]
        acc[policyName] = allowlist;
        return acc;
      }, Map()));
  }

  serialize() {
    return [...this.policies.entries()]
      .map(([policyName, allowlist]) => `${policyName}=(${allowlist.join(' ')})`)
      .join(', ');
  }
};


/**
 * Override 'Permissions-Policy' and 'Feature-Policy' header 's value
 * with those specified in |policyManager.customizedPolicies|.
 *
 * @param {PermissionsPolicyManager} policyManager
 * @param {*} headers
 */
function overridePolicies(policyManager, headers) {
  function isFeaturePolicyHeader(header) {
    return !!header.name.match(RegExp(FP_HEADER, 'i'));
  }

  function isPermissionsPolicyHeader(header) {
    return header.name.match(RegExp(PP_HEADER, 'i'));
  }

  const featurePolicyHeaderString = headers
    .filter(isFeaturePolicyHeader)
    .map(header => header.value)
    .join(';');

  const permissionsPolicyHeaderString = headers
    .filter(isPermissionsPolicyHeader)
    .map(header => header.value)
    .join(',');

  const newFeaturePolicyHeaderString =
    policyManager.overrideFeaturePolicyHeader(
      FeaturePolicyHeader.parse(featurePolicyHeaderString)
    ).serialize();

  const newPermissionsPolicyHeaderString =
    policyManager.overridePermissionsPolicyHeader(
      PermissionsPolicyHeader.parse(permissionsPolicyHeaderString)
    ).serialize();

  return {
    responseHeaders: [{
        name: FP_HEADER,
        value: newFeaturePolicyHeaderString
      },
      {
        name: PP_HEADER,
        value: newPermissionsPolicyHeaderString
      },
      ...incomingResponseHeaders
      .filter(header => !isFeaturePolicyHeader(header) && !isPermissionsPolicyHeader(header))
    ]
  };
}

/**
 * Note: the DevTools network panel won 't show these modified response headers
 * but the changes will work.The panel shows the original headers as returned
 * from the network.See https: //crbug.com258064.
 * TODO: figure out how to communicate this to users.It 'll be confusing
 * if they check the DevTools and it doesn 't show correct values.
 */
chrome.webRequest.onHeadersReceived.addListener(details => {
  // If it is not the top-frame, we just ignore it.
  if (details.frameId !== 0 || !connections.has(details.tabId)) {// || tab.id !== details.tabId) {
    return;
  }
  const policyManager = connections.get(details.tabId).policyManager;
  return overridePolicies(policyManager, details.responseHeaders);
}, {urls: ['<all_urls>'], types: ['main_frame']}, ['blocking', 'responseHeaders']);

chrome.runtime.onConnect.addListener(port => {

  const extensionListener = (message, sender, sendResponse) => {
    // The original connection event doesn't include the tab ID of the
    // DevTools page, so we need to send it explicitly.
    switch (message.name) {
      case 'init':
        connections.set(message.tabId, {port, policyManager: null});
        break;
      default:
        // noop
    }
  };

  port.onMessage.addListener(extensionListener); // Listen to messages sent from the DevTools page.

  port.onDisconnect.addListener(port => {
    port.onMessage.removeListener(extensionListener);

    for (const [tabId, val] of connections) {
      if (val.port === port) {
        connections.get(tabId).policyManager = null; // TODO: make sure to not leave retaining objects around...?
        connections.delete(tabId);
        break;
      }
    }
  });
});
