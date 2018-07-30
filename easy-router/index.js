
import pathToRegexp from 'path-to-regexp'
import debounce from 'lodash/debounce'

function parseVueRoutes(routes, parents = []) {

    let result = {}

    for (const { path, name, children } of routes) {

        const current = [...parents, path]

        if (name) {
            result[name] = pathToRegexp.compile(current.join('/'))
        }

        result = { ...result, ...parseVueRoutes(children, current) }

    }

    return result
}

const default_filed = {
    delay: 0,
    number: false,
    replace: false,
    default_value: ''
}

const parseFlagValue = {
    delay(value) {
        return parseInt(value)
    },
    number(value) {
        return value === 'true' ? true : false
    },
    replace(value) {
        return value === 'true' ? true : false
    },
    default_value(value) {
        return value
    }
}

function parseField(filed) {
    if (typeof filed === 'string') {

        const [, type, name, ..._flags] = filed.trim().match(/^(\w+)\/(\w+)(\.\w+|\.\w+=\w+)$/)
        const flags = {}

        for (const flag of _flags) {
            const [flag_name, flag_value] = flag.substr(1).split('=')
            if (flag_value === undefined) {
                flags[flag_name] = true
            } else {
                flags[flag_name] = parseFlagValue[flag_name](flag_value)
            }
        }
        return { ...default_filed, type, name, ...flags }
    } else {
        return { ...default_filed, ...filed }
    }
}

export class EasyRouter {

    constructor($router) {
        this.$router = $router
        this.named_routes = parseVueRoutes($router.options.routes)
    }

    get $route() {
        return this.$router.app.$route
    }

    static mergeRoute(target, route) {
        const result = {
            query: { ...target.query, ...route.query },
            params: { ...target.params, ...route.params },
        }

        for (const [name, value] of result.query) {
            if (value === undefined || value === '') delete result.query[name]
        }

        for (const [name, value] of result.params) {
            if (value === undefined || value === '') delete result.params[name]
        }

        const router = target.matched.pop()
        const toPath = pathToRegexp.compile(router.path)

        result.path = toPath(result.params)

        return result
    }

    merge(route) {
        this.$router.push(
            EasyRouter.mergeRoute(this.$route, route)
        )
    }

    mergeReplace(route) {
        this.$router.replace(
            EasyRouter.mergeRoute(this.$route, route)
        )
    }

    to(name, route) {
        this.$router.push({
            path: this.named_routes[name](route.params),
            params: route.params
        })
    }

    replaceTo(name, route) {
        this.$router.replace({
            path: this.named_routes[name](route.params),
            params: route.params
        })
    }

    refresh() {
        const route = this.$route
        this.$router.replace('/_empty')
        this.$nextTick(() => { this.$router.replace(route) })
    }

    install(Vue) {
        Vue.prototype.$easy_router = this

        Vue.mixin({
            beforeCreate() {
                const easy_router = this.$options.easy_router

                let fields = []
                if (!easy_router) {
                    return
                } else if (Array.isArray(easy_router)) {
                    fields = easy_router.map(raw_filed => {
                        const filed = parseField(raw_filed)
                        return [filed.name, filed]
                    })
                } else {
                    fields = Object.entries(easy_router,
                        (alias, raw_field) => [alias, parseField(raw_field)])
                }

                if (!this.$options.computed) this.$options.computed = {}

                for (const [alias, field] of fields) {
                    const { name, type, delay, number, default_value, replace } = field

                    const getter = function () {
                        if (number) {
                            const value = this.$route[type][name]
                            if (value !== undefined) return parseFloat(value)
                            else if (!Number.isNaN(parseFloat(default_value))) return parseFloat(default_value)
                            else return 0
                        } else {
                            return this.$route[type][name] || default_value
                        }
                    }

                    let setter = function (_value) {
                        let value

                        if (_value === '' || _value === undefined) {
                            value = default_value
                        }

                        if (replace) {
                            this.$easy_router.mergeReplace({ [type]: { [name]: value } })
                        } else {
                            this.$easy_router.merge({ [type]: { [name]: value } })
                        }
                    }

                    setter = delay ? debounce(_setter, delay) : _setter

                    this.$options.computed[alias] = { get: getter, set: setter }

                }

            }
        })
    }

}