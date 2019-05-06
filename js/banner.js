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

/* banner.js contains a Content Script that adds an informational banner to
each page. */

/******************************************************************************/

'use strict';
(function() {

var DEBUG_FLAG = false;
//text varants
var BANNER_NORMAL = "Lancelot dummy text.";
var BUTTON_NORMAL = "Exit";
var PROGRESS_BAR_HTML = "<div id='progress'><div id='progress_bar'></div></div>";
var BANNER_OPTIONS = {
    "text": BANNER_NORMAL,
    "button": BUTTON_NORMAL,
    "progress_bar": PROGRESS_BAR_HTML
}

var bannerData = {};
var messaging = vAPI.messaging;
const reIP = /^\d+(?:\.\d+){1,3}$/;
var scopeToSrcHostnameMap = {
    '/': '*',
    '.': ''
};
let allDomains = {};
let allDomainCount = 0;
let allHostnameRows = [];
let touchedDomainCount = 0;
const hostnameToSortableTokenMap = new Map();

var bannerFontSize;
/******************************************************************************/
// Print Only when DEBUG_FLAG is true
function debug_log(text) {
    if (DEBUG_FLAG == true) {
        console.log(text);
    }
}

/******************************************************************************/

const formatNumber = function(count) {
    return typeof count === 'number' ? count.toLocaleString() : '';
};

/******************************************************************************/

const rulekeyCompare = function(a, b) {
    let ha = a.slice(2, a.indexOf(' ', 2));
    if ( !reIP.test(ha) ) {
        ha = hostnameToSortableTokenMap.get(ha) || ' ';
    }
    let hb = b.slice(2, b.indexOf(' ', 2));
    if ( !reIP.test(hb) ) {
        hb = hostnameToSortableTokenMap.get(hb) || ' ';
    }
    const ca = ha.charCodeAt(0);
    const cb = hb.charCodeAt(0);
    if ( ca !== cb ) {
        return ca - cb;
    }
    return ha.localeCompare(hb);
};

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
        var banner_options = BANNER_OPTIONS;
        var banner = document.createElement("div");
        banner.innerHTML = "<span> <h2 id='banner-text'></h2><p>Requests Blocked</p><p id='page-blocked-banner'></p></span>";
        banner.id = "lancelot-banner";
        // Get body's first child.
        var firstChild = document.body.firstChild;
        // Add Banner to Page
        document.body.insertBefore(banner, firstChild);
        // Add Exit Button
        var exitButton = document.createElement("a");
        exitButton.classList.add("exitButton");
        exitButton.innerHTML = banner_options.button;
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

function move(newWidth) {
    debug_log(newWidth);
  var elem = document.getElementById("progress_bar");
  elem.style.width = newWidth + '%';
}

/******************************************************************************/
const getBannerData = function(tabId) {
    const onDataReceived = function(response) {
        debug_log("Received!");
        cacheBannerData(response);
        // renderOnce();
        renderBanner();
        renderBannerLazy(); // low priority rendering
        // hashFromBannerData(true);
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

// Assume everything has to be done incrementally.

const renderBanner = function() {
    let elem = document.body;
    elem.classList.toggle(
        'off',
        bannerData.pageURL === '' || bannerData.netFilteringSwitch !== true
    );
    if (bannerData.netFilteringSwitch === true) {
        // console.log("FILTERING IS ON");
        document.getElementById('lancelot-banner').style.backgroundColor = "#2ecc71";
        document.getElementById('banner-text').textContent = "Page Protection On";

    } else {
        // console.log("FILTERING IS OFF");
        document.getElementById('lancelot-banner').style.backgroundColor = "#e74c3c";
        document.getElementById('banner-text').textContent = "Page Protection Off";
    }

    let blocked = bannerData.pageBlockedRequestCount,
        total = bannerData.pageAllowedRequestCount + blocked,
        text;
    if (total === 0) {
        text = formatNumber(0);
    } else {
        text = formatNumber(blocked);
    }

    document.getElementById('page-blocked-banner').textContent = text;

    // This will collate all domains, touched or not
    renderBannerPrivacyExposure();
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
        document.getElementById('bannerHitDomainCount').textContent = "100%";
        move(100);
    } else {
        var value = formatNumber(Math.floor(100 - ((touchedDomainCount) * 100 / allDomainCount)));
        document.getElementById('bannerHitDomainCount').textContent = value + "%";
        debug_log("MOVE:");
        debug_log(value);
        move(value);
    }
}

/******************************************************************************/


const renderBannerLazy = function() {
    messaging.send(
        'banner',
        { what: 'getBannerLazyData', tabId: bannerData.tabId }
    );
};

const onBannerMessage = function(data) {
    if ( !data ) { return; }
    if ( data.tabId !== bannerData.tabId ) { return; }

    // switch ( data.what ) {
    // case 'domSurveyFinalReport':
    //     let count = data.affectedElementCount || '';
    //     uDom.nodeFromSelector('#no-cosmetic-filtering > span.fa-icon-badge')
    //         .textContent = typeof count === 'number'
    //             ? Math.min(count, 99).toLocaleString()
    //             : count;
    //     count = data.scriptCount || '';
    //     break;
    // }
};

messaging.addChannelListener('banner', onBannerMessage);

/******************************************************************************/


const hashFromBannerData = function(reset) {
    // It makes no sense to offer to refresh the behind-the-scene scope
    if ( bannerData.pageHostname === 'behind-the-scene' ) {
        uDom('body').toggleClass('dirty', false);
        return;
    }

    const hasher = [];
    const rules = bannerData.firewallRules;
    for ( const key in rules ) {
        const rule = rules[key];
        if ( rule === null ) { continue; }
        hasher.push(
            rule.src + ' ' +
            rule.des + ' ' +
            rule.type + ' ' +
            rule.action
        );
    }
    hasher.sort();
    hasher.push(uDom('body').hasClass('off'));
    hasher.push(uDom.nodeFromId('no-large-media').classList.contains('on'));
    hasher.push(uDom.nodeFromId('no-cosmetic-filtering').classList.contains('on'));
    hasher.push(uDom.nodeFromId('no-remote-fonts').classList.contains('on'));
    hasher.push(uDom.nodeFromId('no-scripting').classList.contains('on'));

    const hash = hasher.join('');
    if ( reset ) {
        cachedBannerHash = hash;
    }
    uDom('body').toggleClass('dirty', hash !== cachedBannerHash);
};


/******************************************************************************/

// Poll for changes.
//
// I couldn't find a better way to be notified of changes which can affect
// popup content, as the messaging API doesn't support firing events accurately
// from the main extension process to a specific auxiliary extension process:
//
// - broadcasting() is not an option given there could be a lot of tabs opened,
//   and maybe even many frames within these tabs, i.e. unacceptable overhead
//   regardless of whether the popup is opened or not.
//
// - Modifying the messaging API is not an option, as this would require
//   revisiting all platform-specific code to support targeted broadcasting,
//   which who knows could be not so trivial for some platforms.
//
// A well done polling is a better anyways IMO, I prefer that data is pulled
// on demand rather than forcing the main process to assume a client may need
// it and thus having to push it all the time unconditionally.

const pollForContentChange = (function() {
    let pollTimer;

    const pollCallback = function() {
        pollTimer = undefined;
        messaging.send(
            'banner',
            {
                what: 'hasBannerContentChanged',
                tabId: bannerData.tabId,
                contentLastModified: bannerData.contentLastModified
            },
            queryCallback
        );
    };

    const queryCallback = function(response) {
        if ( response ) {
            getBannerData(bannerData.tabId);
            debug_log("POLL HAPPENED!");
            return;
        }
        poll();
    };

    const poll = function() {
        if ( pollTimer !== undefined ) { return; }
        pollTimer = self.setTimeout(pollCallback, 1500);
        // debug_log("timeout set!");
    };

    return poll;
})();


/******************************************************************************/

// run();

})();
