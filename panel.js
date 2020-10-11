/**
 * Copyright 2018 Google Inc. All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import {html, render} from './node_modules/lit-html/lib/lit-extended.js';
import {repeat} from './node_modules/lit-html/lib/repeat.js';

import { PermissionsPolicyManager } from './src/permissions-policy-manager.js';

const persisteAcrossReload = document.querySelector('#persist-on-reload');
const activePoliciesEl = document.querySelector('#active-policies');
const errorEl = document.querySelector('#error-msg');
const restoreButton = document.querySelector('#restore-button');

let _oldUrl = null; // previous url of inspected tab after a reload/navigation.

function reloadPage() {
  chrome.devtools.inspectedWindow.reload();
}

function getBackgroundPage() {
  return new Promise(resolve => {
    chrome.runtime.getBackgroundPage(resolve);
  });
}

const UI = {
  togglePolicy(e) {
    policyManager.togglePolicyOnPage(e.target.value);
    UI.updateDOMLists();
    reloadPage();
  },

  displayError(msg) {
    errorEl.classList.add('show');
    render(html`${msg}`, errorEl);
  },

  clearError() {
    errorEl.classList.remove('show');
  },

  updateDOMLists() {
    const buildList = function(features) {
      return html`
        <table>
          <tr>
            <th colspan="2">Name</th><th>Allowed by page</th><th>Allowed origins</th>
          </tr>
          ${repeat(features, null, ([feature, val], i) => {
            return html`
              <tr data-feature$="${feature}" data-allowed$="${val.allowed}">
                <td>
                  <input type="checkbox" id$="${feature}-check" checked="${val.allowed}"
                         on-input="${UI.togglePolicy}" value="${feature}"
                         class="fp-toggle-input">
                </td>
                <td><label for$="${feature}-check">${feature}</label></td>
                <td><span class="allowed-check" data-allowed$="${val.allowed}"></span></td>
                <td>
                  <span>${val.allowList.length ? val.allowList.join(', ') : ''}</span>
                </td>
              </tr>`;
            }
          )}
          <tr>
        </table>`;
    };

    const featureList = policyManager.buildCustomizedPolicyList();
    render(buildList(Object.entries(featureList)), activePoliciesEl);
  },

  debugResponseHeaders(responseHeaders) {
    const out = document.querySelector('output');
    out.innerHTML = responseHeaders.reduce((accum, curr) => {
      accum += `${JSON.stringify(curr)}\n`;
      return accum;
    }, '');
  }
};

const policyManager = new PermissionsPolicyManager();

// Refresh policy lists if page is navigated.
chrome.devtools.network.onNavigated.addListener(newUrl => {
  const navigatedToDifferentPage = _oldUrl !== newUrl;
  const persistSettings = persisteAcrossReload.checked;

  _oldUrl = newUrl;

  if (navigatedToDifferentPage && !persistSettings) {
    policyManager.restoreOriginalPoliciesSetByPage();
    // Refresh page so chrome.webRequest.onHeadersReceived can run in
    // background page update remove/restore the headers accordingly. The UI
    // then updates the feature list when this handler runs again.
    reloadPage();
    return; // Prevent rest of handler from being run.
  }

  policyManager.getPermissionsPolicies();
});

// Create "Permissions Policies" Devtools panel.
chrome.devtools.panels.create('Permissions Policy', null, 'page.html', async panel => {
  if (!('policy' in document)) {
    UI.displayError(
      `This extension requires the Permissions Policy JS API to work
      (e.g. document.permissionsPolicy or the older document.policy and document.featurePolicy).
      Please turn it on in --enable-experimental-web-platform-features flag in about:flags.`);
  }

  const bgPage = await getBackgroundPage();
  const tab = await bgPage.getCurrentTab();
  if (!tab.url) {
    UI.displayError(`Initial url was not populated by tab.url.
      Check manifest 'tabs' permission`);
  }
  _oldUrl = tab.url; // Set initial URL being inspected..

  policyManager.allPermissionsPoliciesSupportedByBrowser = bgPage.getAllPermissionsPolicies();
  policyManager.getPermissionsPolicies();

  bgPage.setPolicyManager(chrome.devtools.inspectedWindow.tabId, policyManager);

  restoreButton.addEventListener('click', e => {
    policyManager.restoreOriginalPoliciesSetByPage();
    reloadPage();
  });
});


const bgPageConnection = chrome.runtime.connect({name: 'devtools-page'});
bgPageConnection.postMessage({
  name: 'init',
  tabId: chrome.devtools.inspectedWindow.tabId,
});

window.UI = UI;
window.policyManager = policyManager;
