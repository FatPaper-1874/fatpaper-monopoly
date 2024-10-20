export const FATPAPER_DOMAIN = "localhost"; //域名: 登录跳转的时候会用到
export const PROTOCOL: "http" | "https" = "http"; //协议: http https
export const USE_PORT = true; //默认启用端口模式

export const MONOPOLY_CLIENT_PORT = 80;
export const FATPAPER_LOGIN_PORT = 81;
export const MONOPOLY_ADMIN_PORT = 82;
export const USER_SERVER_PORT = 83;
export const MONOPOLY_SERVER_PORT = 84;
export const ICE_SERVER_PORT = 85;

//路径定义: 使用nginx映射的时候会用到
export const USER_SERVER_PATH = "user-server";
export const MONOPOLY_SERVER_PATH = "monopoly-server";
export const ICE_SERVER_PATH = "ice-server";

export const FATPAPER_LOGIN_URL = `${PROTOCOL}://${FATPAPER_DOMAIN}${USE_PORT ? ":" : "/"}${FATPAPER_LOGIN_PORT}`;
export const USER_SERVER_URL = `${PROTOCOL}://${FATPAPER_DOMAIN}${
	USE_PORT ? `:${USER_SERVER_PORT}` : `/${USER_SERVER_PATH}`
}`;
export const MONOPOLY_SERVER_URL = `${PROTOCOL}://${FATPAPER_DOMAIN}${
	USE_PORT ? `:${MONOPOLY_SERVER_PORT}` : `/${MONOPOLY_SERVER_PATH}`
}`;
export const ICE_SERVER_URL = `${PROTOCOL}://${FATPAPER_DOMAIN}${
	USE_PORT ? `:${ICE_SERVER_PORT}` : `/${ICE_SERVER_PATH}`
}`;

export const MYSQL_PORT = 3306;
export const MYSQL_USERNAME = "root";
export const MYSQL_PASSWORD = "root";
