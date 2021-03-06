import applyProps from './applyProps.js';
import {getNodeNamespace} from './createGraph';

/**
 * Adds _query_path fields to the cursor docs which are used for scoped query filtering on the client.
 * 
 * @param cursor 
 * @param ns 
 */
function patchCursor(cursor, ns) {
    const originalObserve = cursor.observe;
    cursor.observe = function (callbacks) {
        const newCallbacks = Object.assign({}, callbacks);
        if (callbacks.added) {
            newCallbacks.added = doc => {
                doc = _.clone(doc);
                doc[`_query_path_${ns}`] = 1;
                callbacks.added(doc);
            };
        }
        originalObserve.call(cursor, newCallbacks);
    };
}

function compose(node, userId, config) {
    return {
        find(parent) {
            if (parent) {
                let {filters, options} = applyProps(node);

                // composition
                let linker = node.linker;
                let accessor = linker.createLink(parent);

                // the rule is this, if a child I want to fetch is virtual, then I want to fetch the link storage of those fields
                if (linker.isVirtual()) {
                    options.fields = options.fields || {};
                    _.extend(options.fields, {
                        [linker.linkStorageField]: 1
                    });
                }

                const cursor = accessor.find(filters, options, userId);
                if (config.scoped) {
                    patchCursor(cursor, getNodeNamespace(node));
                }
                return cursor;
            }
        },

        children: _.map(node.collectionNodes, n => compose(n, userId, config))
    }
}

export default (node, userId, config = {bypassFirewalls: false, scoped: false}) => {
    return {
        find() {
            let {filters, options} = applyProps(node);

            const cursor = node.collection.find(filters, options, userId);
            if (config.scoped) {
                patchCursor(cursor, getNodeNamespace(node));
            }
            return cursor;
        },

        children: _.map(node.collectionNodes, n => {
            const userIdToPass = (config.bypassFirewalls) ? undefined : userId;

            return compose(n, userIdToPass, config);
        })
    }
}