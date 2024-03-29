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

    uBlock Origin Original Repository: https://github.com/gorhill/uBlock
*/

'use strict';

/*******************************************************************************

A PageRequestStore object is used to store net requests in two ways:

To record distinct net requests
To create a log of net requests

**/

/******************************************************************************/
/******************************************************************************/

µBlock.PageStore = (function() {

/******************************************************************************/

const µb = µBlock;

/******************************************************************************/
/******************************************************************************/

// To mitigate memory churning
const netFilteringCacheJunkyard = [];
const netFilteringCacheJunkyardMax = 10;

/******************************************************************************/

const NetFilteringResultCache = function() {
    this.init();
};

NetFilteringResultCache.prototype = {
    shelfLife: 15000,

    init: function() {
        this.blocked = new Map();
        this.results = new Map();
        this.hash = 0;
        this.timer = undefined;
        return this;
    },

    dispose: function() {
        this.empty();
        if ( netFilteringCacheJunkyard.length < netFilteringCacheJunkyardMax ) {
            netFilteringCacheJunkyard.push(this);
        }
        return null;
    },

    rememberResult: function(fctxt, result) {
        if ( fctxt.tabId <= 0 ) { return; }
        if ( this.results.size === 0 ) {
            this.pruneAsync();
        }
        const key = fctxt.getDocHostname() + ' ' + fctxt.type + ' ' + fctxt.url;
        this.results.set(key, {
            result: result,
            logData: fctxt.filter,
            tstamp: Date.now()
        });
        if ( result !== 1 ) { return; }
        const now = Date.now();
        this.blocked.set(key, now);
        this.hash = now;
    },

    rememberBlock: function(fctxt) {
        if ( fctxt.tabId <= 0 ) { return; }
        if ( this.blocked.size === 0 ) {
            this.pruneAsync();
        }
        const now = Date.now();
        this.blocked.set(
            fctxt.getDocHostname() + ' ' + fctxt.type + ' ' + fctxt.url,
            now
        );
        this.hash = now;
    },

    empty: function() {
        this.blocked.clear();
        this.results.clear();
        this.hash = 0;
        if ( this.timer !== undefined ) {
            clearTimeout(this.timer);
            this.timer = undefined;
        }
    },

    prune: function() {
        const obsolete = Date.now() - this.shelfLife;
        for ( const entry of this.blocked ) {
            if ( entry[1] <= obsolete ) {
                this.results.delete(entry[0]);
                this.blocked.delete(entry[0]);
            }
        }
        for ( const entry of this.results ) {
            if ( entry[1].tstamp <= obsolete ) {
                this.results.delete(entry[0]);
            }
        }
        if ( this.blocked.size !== 0 || this.results.size !== 0 ) {
            this.pruneAsync();
        }
    },

    pruneAsync: function() {
        if ( this.timer !== undefined ) { return; }
        this.timer = vAPI.setTimeout(
            ( ) => {
                this.timer = undefined;
                this.prune();
            },
            this.shelfLife
        );
    },

    lookupResult: function(fctxt) {
        return this.results.get(
            fctxt.getDocHostname() + ' ' +
            fctxt.type + ' ' +
            fctxt.url
        );
    },

    lookupAllBlocked: function(hostname) {
        const result = [];
        for ( const entry of this.blocked ) {
            const pos = entry[0].indexOf(' ');
            if ( entry[0].slice(0, pos) === hostname ) {
                result[result.length] = entry[0].slice(pos + 1);
            }
        }
        return result;
    },
};

NetFilteringResultCache.factory = function() {
    const entry = netFilteringCacheJunkyard.pop();
    return entry !== undefined
        ? entry.init()
        : new NetFilteringResultCache();
};

/******************************************************************************/
/******************************************************************************/

// Frame stores are used solely to associate a URL with a frame id. The
// name `pageHostname` is used because of historical reasons. A more
// appropriate name is `frameHostname` -- something to do in a future
// refactoring.

// To mitigate memory churning
const frameStoreJunkyard = [];
const frameStoreJunkyardMax = 50;

/******************************************************************************/

const FrameStore = function(frameURL) {
    this.init(frameURL);
};

FrameStore.prototype = {
    init: function(frameURL) {
        const µburi = µb.URI;
        this.pageHostname = µburi.hostnameFromURI(frameURL);
        this.pageDomain =
            µburi.domainFromHostname(this.pageHostname) || this.pageHostname;
        return this;
    },

    dispose: function() {
        this.pageHostname = this.pageDomain = '';
        if ( frameStoreJunkyard.length < frameStoreJunkyardMax ) {
            frameStoreJunkyard.push(this);
        }
        return null;
    },
};

FrameStore.factory = function(frameURL) {
    const entry = frameStoreJunkyard.pop();
    if ( entry === undefined ) {
        return new FrameStore(frameURL);
    }
    return entry.init(frameURL);
};

/******************************************************************************/
/******************************************************************************/

// To mitigate memory churning
const pageStoreJunkyard = [];
const pageStoreJunkyardMax = 10;

/******************************************************************************/

const PageStore = function(tabId, context) {
    this.init(tabId, context);
    this.journal = [];
    this.journalTimer = null;
    this.journalLastCommitted = this.journalLastUncommitted = undefined;
    this.journalLastUncommittedURL = undefined;
};

/******************************************************************************/

PageStore.factory = function(tabId, context) {
    let entry = pageStoreJunkyard.pop();
    if ( entry === undefined ) {
        entry = new PageStore(tabId, context);
    } else {
        entry.init(tabId, context);
    }
    return entry;
};

/******************************************************************************/

// https://github.com/gorhill/uBlock/issues/3201
//   The context is used to determine whether we report behavior change to the
//   logger.

PageStore.prototype.init = function(tabId, context) {
    const tabContext = µb.tabContextManager.mustLookup(tabId);
    this.tabId = tabId;

    // If we are navigating from-to same site, remember whether large
    // media elements were temporarily allowed.
    if (
        typeof this.allowLargeMediaElementsUntil !== 'number' ||
        tabContext.rootHostname !== this.tabHostname
    ) {
        this.allowLargeMediaElementsUntil = 0;
    }

    this.tabHostname = tabContext.rootHostname;
    this.title = tabContext.rawURL;
    this.rawURL = tabContext.rawURL;
    this.hostnameToCountMap = new Map();
    this.contentLastModified = 0;
    this.frames = new Map();
    this.logData = undefined;
    this.perLoadBlockedRequestCount = 0;
    this.perLoadAllowedRequestCount = 0;
    this.hiddenElementCount = ''; // Empty string means "unknown"
    this.remoteFontCount = 0;
    this.scriptCount = 0;
    this.popupBlockedCount = 0;
    this.largeMediaCount = 0;
    this.largeMediaTimer = null;
    this.netFilteringCache = NetFilteringResultCache.factory();
    this.internalRedirectionCount = 0;

    // The current filtering context is cloned because:
    // - We may be called with or without the current context having been
    //   initialized.
    // - If it has been initialized, we do not want to change the state
    //   of the current context.
    const fctxt = µb.logger.enabled
        ? µBlock.filteringContext
                .duplicate()
                .fromTabId(tabId)
                .setURL(tabContext.rawURL)
        : undefined;

    // https://github.com/uBlockOrigin/uBlock-issues/issues/314
    const masterSwitch = tabContext.getNetFilteringSwitch();

    this.noCosmeticFiltering = µb.sessionSwitches.evaluateZ(
        'no-cosmetic-filtering',
        tabContext.rootHostname
    ) === true;
    if (
        masterSwitch &&
        this.noCosmeticFiltering &&
        µb.logger.enabled &&
        context === 'tabCommitted'
    ) {
        fctxt.setRealm('cosmetic')
             .setType('dom')
             .setFilter(µb.sessionSwitches.toLogData())
             .toLogger();
    }

    // Support `generichide` filter option.
    this.noGenericCosmeticFiltering = masterSwitch !== true;
    if ( this.noGenericCosmeticFiltering !== true ) {
        this.noGenericCosmeticFiltering = this.noCosmeticFiltering;
        if ( this.noGenericCosmeticFiltering !== true ) {
            let result = µb.staticNetFilteringEngine.matchStringGenericHide(
                tabContext.normalURL
            );
            this.noGenericCosmeticFiltering = result === 2;
            if (
                result !== 0 &&
                µb.logger.enabled &&
                context === 'tabCommitted'
            ) {
                fctxt.setRealm('network')
                     .setType('generichide')
                     .setFilter(µb.staticNetFilteringEngine.toLogData())
                     .toLogger();
            }
        }
    }

    return this;
};

/******************************************************************************/

PageStore.prototype.reuse = function(context) {
    // When force refreshing a page, the page store data needs to be reset.

    // If the hostname changes, we can't merely just update the context.
    const tabContext = µb.tabContextManager.mustLookup(this.tabId);
    if ( tabContext.rootHostname !== this.tabHostname ) {
        context = '';
    }

    // If URL changes without a page reload (more and more common), then we
    // need to keep all that we collected for reuse. In particular, not
    // doing so was causing a problem in `videos.foxnews.com`: clicking a
    // video thumbnail would not work, because the frame hierarchy structure
    // was flushed from memory, while not really being flushed on the page.
    if ( context === 'tabUpdated' ) {
        // As part of https://github.com/chrisaljoudi/uBlock/issues/405
        // URL changed, force a re-evaluation of filtering switch
        this.rawURL = tabContext.rawURL;
        return this;
    }

    // A new page is completely reloaded from scratch, reset all.
    if ( this.largeMediaTimer !== null ) {
        clearTimeout(this.largeMediaTimer);
        this.largeMediaTimer = null;
    }
    this.disposeFrameStores();
    this.netFilteringCache = this.netFilteringCache.dispose();
    this.init(this.tabId, context);
    return this;
};

// https://www.youtube.com/watch?v=dltNSbOupgE

/******************************************************************************/

PageStore.prototype.dispose = function() {
    this.tabHostname = '';
    this.title = '';
    this.rawURL = '';
    this.hostnameToCountMap = null;
    this.allowLargeMediaElementsUntil = 0;
    if ( this.largeMediaTimer !== null ) {
        clearTimeout(this.largeMediaTimer);
        this.largeMediaTimer = null;
    }
    this.disposeFrameStores();
    this.netFilteringCache = this.netFilteringCache.dispose();
    if ( this.journalTimer !== null ) {
        clearTimeout(this.journalTimer);
        this.journalTimer = null;
    }
    this.journal = [];
    this.journalLastUncommittedURL = undefined;
    if ( pageStoreJunkyard.length < pageStoreJunkyardMax ) {
        pageStoreJunkyard.push(this);
    }
    return null;
};

/******************************************************************************/

PageStore.prototype.disposeFrameStores = function() {
    for ( const frameStore of this.frames.values() ) {
        frameStore.dispose();
    }
    this.frames.clear();
};

PageStore.prototype.getFrame = function(frameId) {
    return this.frames.get(frameId) || null;
};

PageStore.prototype.setFrame = function(frameId, frameURL) {
    const frameStore = this.frames.get(frameId);
    if ( frameStore !== undefined ) {
        frameStore.init(frameURL);
    } else {
        this.frames.set(frameId, FrameStore.factory(frameURL));
    }
};

/******************************************************************************/

PageStore.prototype.getNetFilteringSwitch = function() {
    return µb.tabContextManager.mustLookup(this.tabId).getNetFilteringSwitch();
};

PageStore.prototype.getSpecificCosmeticFilteringSwitch = function() {
    return this.noCosmeticFiltering !== true;
};

PageStore.prototype.getGenericCosmeticFilteringSwitch = function() {
    return this.noGenericCosmeticFiltering !== true &&
           this.noCosmeticFiltering !== true;
};

PageStore.prototype.toggleNetFilteringSwitch = function(url, scope, state) {
    µb.toggleNetFilteringSwitch(url, scope, state);
    this.netFilteringCache.empty();
};

/******************************************************************************/

PageStore.prototype.injectLargeMediaElementScriptlet = function() {
    this.largeMediaTimer = null;
    µb.scriptlets.injectDeep(
        this.tabId,
        'load-large-media-interactive'
    );
    µb.contextMenu.update(this.tabId);
};

PageStore.prototype.temporarilyAllowLargeMediaElements = function(state) {
    this.largeMediaCount = 0;
    µb.contextMenu.update(this.tabId);
    this.allowLargeMediaElementsUntil = state ? Date.now() + 86400000 : 0;
    µb.scriptlets.injectDeep(this.tabId, 'load-large-media-all');
};

/******************************************************************************/

// https://github.com/gorhill/uBlock/issues/2053
//   There is no way around using journaling to ensure we deal properly with
//   potentially out of order navigation events vs. network request events.

PageStore.prototype.journalAddRequest = function(hostname, result) {
    if ( hostname === '' ) { return; }
    this.journal.push(
        hostname,
        result === 1 ? 0x00000001 : 0x00010000
    );
    if ( this.journalTimer === null ) {
        this.journalTimer = vAPI.setTimeout(
            ( ) => { this.journalProcess(true); },
            µb.hiddenSettings.requestJournalProcessPeriod
        );
    }
};

PageStore.prototype.journalAddRootFrame = function(type, url) {
    if ( type === 'committed' ) {
        this.journalLastCommitted = this.journal.length;
        if (
            this.journalLastUncommitted !== undefined &&
            this.journalLastUncommitted < this.journalLastCommitted &&
            this.journalLastUncommittedURL === url
        ) {
            this.journalLastCommitted = this.journalLastUncommitted;
            this.journalLastUncommitted = undefined;
        }
    } else if ( type === 'uncommitted' ) {
        this.journalLastUncommitted = this.journal.length;
        this.journalLastUncommittedURL = url;
    }
    if ( this.journalTimer !== null ) {
        clearTimeout(this.journalTimer);
    }
    this.journalTimer = vAPI.setTimeout(
        ( ) => { this.journalProcess(true); },
        µb.hiddenSettings.requestJournalProcessPeriod
    );
};

PageStore.prototype.journalProcess = function(fromTimer) {
    if ( !fromTimer ) {
        clearTimeout(this.journalTimer);
    }
    this.journalTimer = null;

    const journal = this.journal;
    const now = Date.now();
    let aggregateCounts = 0;
    let pivot = this.journalLastCommitted || 0;

    // Everything after pivot originates from current page.
    for ( let i = pivot; i < journal.length; i += 2 ) {
        const hostname = journal[i];
        let hostnameCounts = this.hostnameToCountMap.get(hostname);
        if ( hostnameCounts === undefined ) {
            hostnameCounts = 0;
            this.contentLastModified = now;
        }
        let count = journal[i+1];
        this.hostnameToCountMap.set(hostname, hostnameCounts + count);
        aggregateCounts += count;
    }
    this.perLoadBlockedRequestCount += aggregateCounts & 0xFFFF;
    this.perLoadAllowedRequestCount += aggregateCounts >>> 16 & 0xFFFF;
    this.journalLastCommitted = undefined;

    // https://github.com/chrisaljoudi/uBlock/issues/905#issuecomment-76543649
    //   No point updating the badge if it's not being displayed.
    if ( (aggregateCounts & 0xFFFF) && µb.userSettings.showIconBadge ) {
        µb.updateToolbarIcon(this.tabId, 0x02);
    }

    // Everything before pivot does not originate from current page -- we still
    // need to bump global blocked/allowed counts.
    for ( let i = 0; i < pivot; i += 2 ) {
        aggregateCounts += journal[i+1];
    }
    if ( aggregateCounts !== 0 ) {
        µb.localSettings.blockedRequestCount += aggregateCounts & 0xFFFF;
        µb.localSettings.allowedRequestCount += aggregateCounts >>> 16 & 0xFFFF;
        µb.localSettingsLastModified = now;
    }
    journal.length = 0;
};

/******************************************************************************/

PageStore.prototype.filterRequest = function(fctxt) {
    fctxt.filter = undefined;

    if ( this.getNetFilteringSwitch() === false ) {
        return 0;
    }

    const requestType = fctxt.type;

    if ( requestType === 'csp_report' && this.filterCSPReport(fctxt) === 1 ) {
        return 1;
    }

    if ( requestType.endsWith('font') && this.filterFont(fctxt) === 1 ) {
        return 1;
    }

    if (
        requestType === 'script' &&
        this.filterScripting(fctxt, true) === 1
    ) {
        return 1;
    }

    const cacheableResult = this.cacheableResults.has(requestType);

    if ( cacheableResult ) {
        const entry = this.netFilteringCache.lookupResult(fctxt);
        if ( entry !== undefined ) {
            fctxt.filter = entry.logData;
            return entry.result;
        }
    }

    // Dynamic URL filtering.
    let result = µb.sessionURLFiltering.evaluateZ(
        fctxt.getTabHostname(),
        fctxt.url,
        requestType
    );
    if ( result !== 0 && µb.logger.enabled ) {
        fctxt.filter = µb.sessionURLFiltering.toLogData();
    }

    // Dynamic hostname/type filtering.
    if ( result === 0 && µb.userSettings.advancedUserEnabled ) {
        result = µb.sessionFirewall.evaluateCellZY(
            fctxt.getTabHostname(),
            fctxt.getHostname(),
            requestType
        );
        if ( result !== 0 && result !== 3 && µb.logger.enabled ) {
            fctxt.filter = µb.sessionFirewall.toLogData();
        }
    }

    // Static filtering has lowest precedence.
    if ( result === 0 || result === 3 ) {
        result = µb.staticNetFilteringEngine.matchString(fctxt);
        if ( result !== 0 && µb.logger.enabled ) {
            fctxt.filter = µb.staticNetFilteringEngine.toLogData();
        }
    }

    if ( cacheableResult ) {
        this.netFilteringCache.rememberResult(fctxt, result);
    } else if ( result === 1 && this.collapsibleResources.has(requestType) ) {
        this.netFilteringCache.rememberBlock(fctxt, true);
    }

    return result;
};

PageStore.prototype.cacheableResults = new Set([
    'sub_frame',
]);

PageStore.prototype.collapsibleResources = new Set([
    'image',
    'media',
    'object',
    'sub_frame',
]);

/******************************************************************************/

PageStore.prototype.filterCSPReport = function(fctxt) {
    if (
        µb.sessionSwitches.evaluateZ(
            'no-csp-reports',
            fctxt.getHostname()
        )
    ) {
        if ( µb.logger.enabled ) {
            fctxt.filter = µb.sessionSwitches.toLogData();
        }
        return 1;
    }
    return 0;
};

/******************************************************************************/

PageStore.prototype.filterFont = function(fctxt) {
    if ( fctxt.type === 'font' ) {
        this.remoteFontCount += 1;
    }
    if (
        µb.sessionSwitches.evaluateZ(
            'no-remote-fonts',
            fctxt.getTabHostname()
        ) !== false
    ) {
        if ( µb.logger.enabled ) {
            fctxt.filter = µb.sessionSwitches.toLogData();
        }
        return 1;
    }
    return 0;
};

/******************************************************************************/

PageStore.prototype.filterScripting = function(fctxt, netFiltering) {
    fctxt.filter = undefined;
    if ( netFiltering === undefined ) {
        netFiltering = this.getNetFilteringSwitch();
    }
    if (
        netFiltering === false ||
        µb.sessionSwitches.evaluateZ(
            'no-scripting',
            fctxt.getTabHostname()
        ) === false
    ) {
        return 0;
    }
    if ( µb.logger.enabled ) {
        fctxt.filter = µb.sessionSwitches.toLogData();
    }
    return 1;
};

/******************************************************************************/

// The caller is responsible to check whether filtering is enabled or not.

PageStore.prototype.filterLargeMediaElement = function(fctxt, size) {
    fctxt.filter = undefined;

    if ( Date.now() < this.allowLargeMediaElementsUntil ) {
        return 0;
    }
    if (
        µb.sessionSwitches.evaluateZ(
            'no-large-media',
            fctxt.getTabHostname()
        ) !== true
    ) {
        return 0;
    }
    if ( (size >>> 10) < µb.userSettings.largeMediaSize ) {
        return 0;
    }

    this.largeMediaCount += 1;
    if ( this.largeMediaTimer === null ) {
        this.largeMediaTimer = vAPI.setTimeout(
            this.injectLargeMediaElementScriptlet.bind(this),
            500
        );
    }

    if ( µb.logger.enabled ) {
        fctxt.filter = µb.sessionSwitches.toLogData();
    }

    return 1;
};

// https://www.youtube.com/watch?v=drW8p_dTLD4

/******************************************************************************/

PageStore.prototype.getBlockedResources = function(request, response) {
    const normalURL = µb.normalizePageURL(this.tabId, request.frameURL);
    const resources = request.resources;
    const fctxt = µBlock.filteringContext;
    fctxt.fromTabId(this.tabId)
         .setDocOriginFromURL(normalURL);
    // Force some resources to go through the filtering engine in order to
    // populate the blocked-resources cache. This is required because for
    // some resources it's not possible to detect whether they were blocked
    // content script-side (i.e. `iframes` -- unlike `img`).
    if ( Array.isArray(resources) && resources.length !== 0 ) {
        for ( const resource of resources ) {
            this.filterRequest(
                fctxt.setType(resource.type)
                     .setURL(resource.url)
            );
        }
    }
    if ( this.netFilteringCache.hash === response.hash ) { return; }
    response.hash = this.netFilteringCache.hash;
    response.blockedResources =
        this.netFilteringCache.lookupAllBlocked(fctxt.getDocHostname());
};

/******************************************************************************/

return {
    factory: PageStore.factory
};

})();

/******************************************************************************/
