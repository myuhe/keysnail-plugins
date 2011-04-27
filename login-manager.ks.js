var PLUGIN_INFO =
<KeySnailPlugin>
    <name>LoginManager</name>
    <description>LoginManager for KeySnail</description>
    <version>0.0.3</version>
    <updateURL>http://github.com/hogelog/keysnail-plugins/raw/master/loginmanager.ks.js</updateURL>
    <author mail="konbu.komuro@gmail.com" homepage="http://hogel.org/">hogelog</author>
    <license>CC0</license>
    <minVersion>1.5.1</minVersion>
    <include>main</include>
    <detail><![CDATA[]]></detail>
</KeySnailPlugin>;

let pOptions = plugins.setupOptions('login_manager', {
    'auto_login': {
        preset: [],
        description: M({ja: '起動時に自動ログインするサービス', en: 'Auto login services'})
    }
}, PLUGIN_INFO);

var loginManager = Cc["@mozilla.org/login-manager;1"].getService(Ci.nsILoginManager);

var services = {
    pixiv: {
        HOST: ["http://www.pixiv.net"],
        LOGIN: "/index.php",
        LOGOUT: "/logout.php",
        usernameField: "pixiv_id",
        passwordField: "pass",
        extraField: {
            mode: "login",
            skip: "1",
        },
    },
    drawr: {
        HOST: ["http://drawr.net"],
        LOGIN: "/login.php",
        LOGOUT: "/logout.php",
        usernameField: "user_uid",
        passwordField: "user_upw",
        extraField: {
            mode: "autologin",
        },
    },
    mixi: {
        HOST: ["https://mixi.jp", "http://mixi.jp"],
        LOGIN: "/login.pl",
        LOGOUT: "/logout.pl",
        usernameField: "email",
        passwordField: "password",
        extraField: {
            next_url: "/home.pl",
        },
    },
    hatena: {
        HOST: ["https://www.hatena.ne.jp", "http://www.hatena.ne.jp"],
        LOGIN: "/login",
        LOGOUT: "/logout",
        usernameField: "name",
        passwordField: "password",
        logoutBeforeLogin: true,
    },
    hatelabo: {
        HOST: ["https://www.hatelabo.jp", "http://www.hatelabo.jp"],
        LOGIN: "/login",
        LOGOUT: "/logout",
        usernameField: "key",
        passwordField: "password",
        logoutBeforeLogin: true,
        extraField: {
            mode: "enter",
        },
    },
    tumblr: {
        HOST: ["http://www.tumblr.com"],
        LOGIN: "/login",
        LOGOUT: "/logout",
        usernameField: "email",
        passwordField: "password",
    },
    twitter: {
        HOST: ["https://twitter.com", "http://twitter.com"],
        LOGIN: "/sessions?phx=1",
        LOGOUT: "/logout",
        usernameField: "session[username_or_email]",
        passwordField: "session[password]",
        logoutBeforeLogin: true,
        extraField: {
            authenticity_token: function(service) {
                try {
                    return util.httpGet(service.HOST[0]).responseText.match(/<[^<>]*?name='authenticity_token'[^<>]*?>/)[0].match(/value='([^']+)'/)[1];
                }catch(e){
                    return 'dummy';
                }
            },
        },
    },
    "wassr.com": {
        HOST: ["https://wassr.com", "http://wassr.com", "https://wassr.jp", "http://wassr.jp"],
        LOGIN: "/account/login",
        LOGOUT: "/account/logout",
        usernameField: "login_id",
        passwordField: "login_pw",
        extraField: {
            CSRFPROTECT: tokenGetter(/CSRFPROTECT.+value="(.+?)"/),
        },
    },
    "wassr.jp": {
        HOST: ["https://wassr.jp", "http://wassr.jp", "https://wassr.com", "http://wassr.com"],
        LOGIN: "/account/login",
        LOGOUT: "/account/logout",
        usernameField: "login_id",
        passwordField: "login_pw",
        extraField: {
            CSRFPROTECT: tokenGetter(/CSRFPROTECT.+value="(.+?)"/),
        },
    },
    google: {
        HOST: ['https://www.google.com'],
        LOGIN: '/accounts/LoginAuth',
        LOGOUT: '/accounts/Logout',
        usernameField: 'Email',
        passwordField: 'Passwd',
        extraField: {
            GALX: function(service) util.httpGet(service.HOST[0] + service.LOGIN)
                    .responseText.match(/<[^<>]*?name="GALX"[^<>]*?>/)[0].match(/value="(.+)"/)[1],
        },
    },
};
for (name in services){
    services[name] = new Service(services[name]);
}

let userServices = plugins.options.userLoginServices;
if (userServices) {
    for (name in userServices){
        services[name] = new Service(userServices[name]);
    }
}

// Library
// {{{
function Service(service) //{{{
{
    let self = this;
    self.login = function(username){
        let content = {};
        let host = service.HOST[0];
        content[service.usernameField] = username;
        if (!self.setPassword(content, username)) {
            display.echoStatusBar('failed get password "'+host+'" as '+username);
            return false;
        }
        if (service.extraField && !self.setExtraField(content)) return false;

        let loginURL = host+service.LOGIN;
        let error = function(e) display.echoStatusBar('login failed "'+host+'" as '+username);
        let success = function(e) display.echoStatusBar('login "'+host+'" as '+username);
        let login = function() request(loginURL, content, success, error);
        if (service.logoutBeforeLogin) {
            return self.logout(login);
        }

        login();
    };
    self.logout = function(overrideSuccess){
        let content = {};
        let host = service.HOST[0];
        if (service.extraField && !self.setExtraField(content)) return false;
        let logoutURL = host+service.LOGOUT;
        let error = function() display.echoStatusBar('logout failed "'+host);
        let success = function() display.echoStatusBar('logout "'+host);

        request(logoutURL, content, overrideSuccess || success, error);
    };
    self.getLogins = function() {
        return [loginManager.findLogins({}, host, "", null) for each(host in service.HOST)]
        .reduce(function(sum, logins){
            return sum.concat(logins.filter(function(login)
                sum.length==0 || sum.filter(function(x)
                    x.username==login.username).length==0))
                }, []);
    };
    self.getUsernames = function(){
        return [x.username for each(x in self.getLogins()) if(x.username)];
    };
    self.setPassword = function(content, username){
        let logins = self.getLogins()
            .filter(function(x) x.username==username);

        if(logins.length==0) return false;
        content[service.passwordField] = logins[0].password;
        return content;
    };
    self.setExtraField = function(content){
        if (!service.extraField) return false;
        for (field in service.extraField){
            let value = service.extraField[field];
            switch(typeof value) {
            case "function":
                content[field] = value(service);
                break;
            case "string":
                content[field] = value;
                break;
            }
            if (!content[field]){
                display.echoStatusBar("failed get "+field);
                return false;
            }
        }
        return content;
    };
    for (prop in service){
        if (self[prop]) self["_"+prop] = self[prop];
        self[prop] = service[prop];
    }
} //}}}

function encode(content)
    [k+"="+encodeURIComponent(content[k]) for(k in content)].join("&");
function request(url, content, onload, onerror)
{
    let req = new XMLHttpRequest;
    req.open("POST", url, true);
    req.onload = onload;
    req.onerror = onerror;
    req.setRequestHeader("Content-Type", "application/x-www-form-urlencoded");
    req.send(encode(content));
}
function tokenGetter(pattern)
{
    return function(service){
        let res = util.httpGet(service.HOST[0]);
        if (pattern.test(res.responseText)){
            return RegExp.$1;
        }
    };
}
//}}}
let loginList = [[[s, u] for each (u in services[s].getUsernames())] for (s in services)].reduce(function (acc, login) acc.concat(login), []);
let logoutList = [[s] for (s in services)];

const LATEST_KEY = 'login_manager_latest';
let latestLogins = persist.restore(LATEST_KEY) || {};

pOptions['auto_login'].forEach(function(s) {
    let username = latestLogins[s];
    if (!username) return;

util.message('auto login: ' + username + '@' + s);
    let service = services[s];
    service.login(username);
});

plugins.withProvides(function (provide) {
    provide("login-manager-login", function (ev, arg) {
        prompt.selector({
            message: "Log In (LoginManager)",
            callback: function (index) {
                let [servicename, username] = loginList[index];
                let service = services[servicename];
                if (!service) {
                    display.echoStatusBar(servicename + "service not found");
                    return false;
                }
                service.login(username);

                let s = pOptions['auto_login'].map(function(s) servicename === s);
                if (s.length > 0) {
                    latestLogins[servicename] = username;
                    persist.preserve(latestLogins, LATEST_KEY);
                }
            },
            header: ["Service", "Username"],
            collection: loginList,
            initialInput: arg,
        });
        }, "Log In (LoginManager)");
    provide("login-manager-logout", function (ev, arg) {
        prompt.selector({
            message: "Log Out (LoginManager)",
            callback: function (index) {
                let servicename = logoutList[index][0];
                let service = services[servicename];
                if (!service) {
                    display.echoStatusBar(servicename + "service not found");
                    return false;
                }
                service.logout();

                let s = pOptions['auto_login'].map(function(s) servicename === s);
                if (s.length > 0) {
                    delete latestLogins[servicename];
                    persist.preserve(latestLogins, LATEST_KEY);
                }
            },
            header: ["Service"],
            collection: logoutList,
            initialInput: arg,
        });
        }, "Log Out (LoginManager)");
}, PLUGIN_INFO);

// vim: fdm=marker fenc=utf-8 sw=4 ts=4 et:
