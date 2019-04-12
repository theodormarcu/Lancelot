/*******************************************************************************

    Lancelot - A child-friendly tracker and ad blocker built on top of uBlock Origin.
    Copyright (C) 2019-present Theodor Marcu. Thanks to Raymond Hill and the uBlock contributors for their work.

    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

    You should have received a copy of the GNU General Public License
    along with this program.  If not, see {http://www.gnu.org/licenses/}.

    Home: https://github.com/gorhill/uBlock
*/


'use strict';

/******************************************************************************/

var DEBUG_FLAG = true;
//text varants
var BANNER_NORMAL = "Lancelot dummy text.";
var BUTTON_NORMAL = "Exit";
var BANNER_OPTIONS = {
    "normal": {
        "text": BANNER_NORMAL,
        "button": BUTTON_NORMAL,
    }
}

var bannerData = {};
var messaging = vAPI.messaging;
var scopeToSrcHostnameMap = {
    '/': '*',
    '.': ''
};
const hostnameToSortableTokenMap = new Map();
/******************************************************************************/
// Print Only when DEBUG_FLAG is true
function debug_log(text) {
    if (DEBUG_FLAG == true) {
        console.log(text);
    }
}
/******************************************************************************/
function run() {
    debug_log("run() Called.");
    // If there's no tab id specified in the query string,
    // it will default to current tab.
    let tabId = null;

    // Extract the tab id of the page this popup is for
    const matches = window.location.search.match(/[\?&]tabId=([^&]+)/);
    if (matches && matches.length === 2) {
        tabId = parseInt(matches[1], 10) || 0;
    }
    debug_log(tabId);
    getBannerData(tabId);
    if (!document.getElementById("lancelot-banner")) {
        insertBanner();
    } else {
        removeBanner();
        insertBanner();
    }
}

// Insert banner into every HTML page before any other element.
function insertBanner() {
    debug_log("insertBanner() called.");
    if (document.body !== null && !document.getElementById("lancelot-banner")) {
        // Create Banner
        var bannervarants = BANNER_OPTIONS['normal'];
        var banner = document.createElement("div");
        banner.innerHTML = "<span><p id='banner-text'></p><p id='page-blocked-banner'></p></span>";
        banner.id = "lancelot-banner";
        var firstChild = document.body.firstChild;
        // Add Banner to Page
        document.body.insertBefore(banner, firstChild);
        // Add Exit Button
        var exitButton = document.createElement("a");
        exitButton.classList.add("exitButton");
        exitButton.innerHTML = bannervarants.button;
        exitButton.onclick = (function() {
            removeBanner();
        })
        document.getElementById("lancelot-banner").appendChild(exitButton);
        debug_log("insertBanner() finished running.");
        // debug_log(bannerData.globalBlockedRequestCount);
    }
}

// Remove Banner
function removeBanner() {
    var element = document.getElementById("lancelot-banner");
    if (element) {
        element.parentNode.removeChild(element);
    }
}
/******************************************************************************/
const getBannerData = function(tabId) {
    const onDataReceived = function(response) {
        debug_log("Received!");
        cacheBannerData(response);
        renderOnce();
        renderBanner();
        renderBannerLazy(); // low priority rendering
        hashFromPopupData(true);
        pollForContentChange();
    };
    messaging.send(
        'banner', {
            what: 'getBannerData',
            tabId: tabId
        },
        onDataReceived
    );
};

/******************************************************************************/

const cacheBannerData = function(data) {
    bannerData = {};
    scopeToSrcHostnameMap['.'] = '';
    hostnameToSortableTokenMap.clear();

    if (typeof data !== 'object') {
        return bannerData;
    }
    bannerData = data;
    scopeToSrcHostnameMap['.'] = bannerData.pageHostname || '';
    const hostnameDict = bannerData.hostnameDict;
    if (typeof hostnameDict !== 'object') {
        return bannerData;
    }
    for (const hostname in hostnameDict) {
        if (hostnameDict.hasOwnProperty(hostname) === false) {
            continue;
        }
        let domain = hostnameDict[hostname].domain;
        let prefix = hostname.slice(0, 0 - domain.length - 1);
        // Prefix with space char for 1st-party hostnames: this ensure these
        // will come first in list.
        if (domain === bannerData.pageDomain) {
            domain = '\u0020';
        }
        hostnameToSortableTokenMap.set(
            hostname,
            domain + ' ' + prefix.split('.').reverse().join('.')
        );
    }
    return bannerData;
};


/******************************************************************************/

// All rendering code which need to be executed only once.

let renderOnce = function() {
    renderOnce = function() {};

    if (bannerData.fontSize !== bannerFontSize) {
        bannerFontSize = bannerData.fontSize;
        if (bannerFontSize !== 'unset') {
            document.body.style.setProperty('font-size', bannerFontSize);
            vAPI.localStorage.setItem('bannerFontSize', bannerFontSize);
        } else {
            document.body.style.removeProperty('font-size');
            vAPI.localStorage.removeItem('bannerFontSize');
        }
    }
};

/******************************************************************************/

// Assume everything has to be done incrementally.

const renderBanner = function() {
    if (bannerData.tabTitle) {
        document.title = bannerData.appName + ' - ' + bannerData.tabTitle;
    }
    let elem = document.body;
    elem.classList.toggle(
        'off',
        bannerData.pageURL === '' || bannerData.netFilteringSwitch !== true
    );
    if (bannerData.netFilteringSwitch === true) {
        // console.log("FILTERING IS ON");
        uDom.nodeFromId('lancelot-banner').value = #2ecc71;
        uDom.nodeFromId('banner-text').textContent = "Page Protection On";

    } else {
        // console.log("FILTERING IS OFF");
        uDom.nodeFromId('lancelot-banner').src = "../img/icon_128-off.png";
        uDom.nodeFromId('banner-text').textContent = "Page Protection Off";
    }

    let blocked = popupData.pageBlockedRequestCount,
        total = popupData.pageAllowedRequestCount + blocked,
        text;
    if (total === 0) {
        text = formatNumber(0);
    } else {
        text = formatNumber(blocked);
    }

    uDom.nodeFromId('page-blocked-banner').textContent = text;

    // This will collate all domains, touched or not
    renderBannerPrivacyExposure();

    // Extra tools
    updateHnSwitches();

    // Report blocked popup count on badge
    total = popupData.popupBlockedCount;
    // uDom.nodeFromSelector('#no-popups > span.fa-icon-badge')
    //     .textContent = total ? Math.min(total, 99).toLocaleString() : '';

    // Report large media count on badge
    total = popupData.largeMediaCount;
    // uDom.nodeFromSelector('#no-large-media > span.fa-icon-badge')
    //     .textContent = total ? Math.min(total, 99).toLocaleString() : '';

    // Report remote font count on badge
    total = popupData.remoteFontCount;
    // uDom.nodeFromSelector('#no-remote-fonts > span.fa-icon-badge')
    //     .textContent = total ? Math.min(total, 99).toLocaleString() : '';

    // https://github.com/chrisaljoudi/uBlock/issues/470
    // This must be done here, to be sure the popup is resized properly
    const dfPaneVisible = popupData.dfEnabled;

    // https://github.com/chrisaljoudi/uBlock/issues/1068
    // Remember the last state of the firewall pane. This allows to
    // configure the popup size early next time it is opened, which means a
    // less glitchy popup at open time.
    if (dfPaneVisible !== dfPaneVisibleStored) {
        dfPaneVisibleStored = dfPaneVisible;
        vAPI.localStorage.setItem('popupFirewallPane', dfPaneVisibleStored);
    }

    uDom.nodeFromId('panes').classList.toggle(
        'dfEnabled',
        dfPaneVisible === true
    );

    elem = uDom.nodeFromId('firewallContainer');
    elem.classList.toggle(
        'minimized',
        popupData.firewallPaneMinimized === true
    );
    elem.classList.toggle(
        'colorBlind',
        popupData.colorBlindFriendly === true
    );

    // Build dynamic filtering pane only if in use
    if (dfPaneVisible) {
        buildAllFirewallRows();
    }

    renderTooltips();
};

/******************************************************************************/

const renderBannerPrivacyExposure = function() {
    allDomains = {};
    allDomainCount = touchedDomainCount = 0;
    allHostnameRows = [];

    // Sort hostnames. First-party hostnames must always appear at the top
    // of the list.
    const desHostnameDone = {};
    const keys = Object.keys(bannerData.firewallRules)
        .sort(rulekeyCompare);
    for (const key of keys) {
        const des = key.slice(2, key.indexOf(' ', 2));
        // Specific-type rules -- these are built-in
        if (des === '*' || desHostnameDone.hasOwnProperty(des)) {
            continue;
        }
        const hnDetails = bannerData.hostnameDict[des] || {};
        if (allDomains.hasOwnProperty(hnDetails.domain) === false) {
            allDomains[hnDetails.domain] = false;
            allDomainCount += 1;
        }
        if (hnDetails.allowCount !== 0) {
            if (allDomains[hnDetails.domain] === false) {
                allDomains[hnDetails.domain] = true;
                touchedDomainCount += 1;
            }
        }
        allHostnameRows.push(des);
        desHostnameDone[des] = true;
    }

    if (allDomainCount === 0) {
        uDom.nodeFromId('bannerHitDomainCount').textContent = "100%";
    } else {
        uDom.nodeFromId('bannerHitDomainCount').textContent = formatNumber(Math.floor(100 - ((touchedDomainCount) * 100 / allDomainCount))) + "%";
    }
}


/******************************************************************************/


run();
