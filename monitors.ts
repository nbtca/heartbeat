import type { Group } from './src/types.ts'

export default [
  {
    name: 'Websites & docs',
    zh: '网站与文档',
    items: [
      { id: 'home', name: 'nbtca.space', role: 'Association website', roleZh: '协会官网', http: 'https://nbtca.space' },
      { id: 'docs', name: 'docs.nbtca.space', role: 'Handbook and guides', roleZh: '协会文档', http: 'https://docs.nbtca.space' },
      { id: 'blogs', name: 'blogs.nbtca.space', role: 'Member blog', roleZh: '计协博客', http: 'https://blogs.nbtca.space' },
    ],
  },
  {
    name: 'Repair service',
    zh: '维修服务',
    items: [
      { id: 'api', name: 'Repair API', zh: '维修 API', role: 'Saturday, api.nbtca.space', roleZh: 'Saturday，api.nbtca.space', http: 'https://api.nbtca.space/ping' },
    ],
  },
  {
    name: 'Chat bot',
    zh: '机器人',
    items: [
      { id: 'bot-qq', name: 'QQ bot', zh: 'QQ 机器人', role: 'HuaJiBot.NET, connection to OneBot', roleZh: 'HuaJiBot.NET，OneBot 连接状态', http: 'https://bot.app.nbtca.space/qq/healthz' },
      { id: 'bot-tg', name: 'Telegram bot', zh: 'Telegram 机器人', role: 'HuaJiBot.NET, connection to Telegram', roleZh: 'HuaJiBot.NET，Telegram 连接状态', http: 'https://bot.app.nbtca.space/tg/healthz' },
    ],
  },
  {
    name: 'Accounts',
    zh: '账号',
    items: [
      {
        id: 'auth',
        name: 'Single sign-on',
        zh: '统一登录',
        role: 'Logto, auth.app.nbtca.space',
        roleZh: 'Logto，auth.app.nbtca.space',
        http: 'https://auth.app.nbtca.space/oidc/.well-known/openid-configuration',
      },
      { id: 'myid', name: 'Account dashboard', zh: '账号中心', role: 'Logto-USS, myid.app.nbtca.space', roleZh: 'Logto-USS，myid.app.nbtca.space', http: 'https://myid.app.nbtca.space' },
      { id: 'github-oauth', name: 'GitHub sign-in proxy', zh: 'GitHub 登录代理', role: 'github-oauth.nbtca.space', http: 'https://github-oauth.nbtca.space' },
    ],
  },
  {
    name: 'Apps',
    zh: '应用',
    items: [
      { id: 'icloud', name: 'Shared drive', zh: '协会云盘', role: 'icloud.nbtca.space', http: 'https://icloud.nbtca.space' },
      { id: 'link', name: 'Short links', zh: '短链接', role: 'shortlink, link.nbtca.space', roleZh: 'shortlink，link.nbtca.space', http: 'https://link.nbtca.space', status: 400 },
      { id: 'ical', name: 'Calendar feeds', zh: '日历订阅', role: 'calendar, ical.nbtca.space', roleZh: 'calendar，ical.nbtca.space', http: 'https://ical.nbtca.space', head: true, every: 5 },
      { id: 'papers', name: 'Exam papers', zh: '试卷平台', role: 'papers.dev.nbtca.space', http: 'https://papers.dev.nbtca.space' },
    ],
  },
  {
    name: 'Games',
    zh: '游戏',
    items: [{ id: 'mc', name: 'Minecraft', role: 'orangedog.nbtca.space:25565', tcp: 'orangedog.nbtca.space:25565', minecraft: true }],
  },
  {
    name: 'Messaging & storage',
    zh: '消息与存储',
    infra: true,
    items: [
      {
        id: 'webhook',
        name: 'Webhook relay',
        zh: 'Webhook 中转',
        role: 'ServerlessMQ, webhook.nbtca.space',
        roleZh: 'ServerlessMQ，webhook.nbtca.space',
        http: 'https://webhook.nbtca.space',
      },
      { id: 'mq', name: 'Message relay', zh: '消息中转', role: 'ServerlessMQ, mq.nbtca.space', roleZh: 'ServerlessMQ，mq.nbtca.space', http: 'https://mq.nbtca.space' },
      { id: 'oss', name: 'Object storage', zh: '对象存储', role: 'Aliyun OSS, oss.nbtca.space', roleZh: '阿里云 OSS，oss.nbtca.space', http: 'https://oss.nbtca.space', status: 403, slowMs: 5000 },
    ],
  },
  {
    name: 'Platform',
    zh: '平台',
    infra: true,
    items: [
      {
        id: 'traefik',
        name: 'Ingress gateway',
        zh: '入口网关',
        role: 'Traefik, traefik.app.nbtca.space',
        roleZh: 'Traefik，traefik.app.nbtca.space',
        http: 'https://traefik.app.nbtca.space/api/overview',
      },
      {
        id: 'consul',
        name: 'Service discovery',
        zh: '服务发现',
        role: 'Consul, consul.app.nbtca.space',
        roleZh: 'Consul，consul.app.nbtca.space',
        http: 'https://consul.app.nbtca.space/v1/status/leader',
      },
      {
        id: 'prometheus',
        name: 'Metrics',
        zh: '监控指标',
        role: 'Prometheus, prometheus.app.nbtca.space',
        roleZh: 'Prometheus，prometheus.app.nbtca.space',
        http: 'https://prometheus.app.nbtca.space/-/healthy',
        status: 401,
      },
      { id: 'logs', name: 'Log viewer', zh: '容器日志', role: 'Dozzle, log.app.nbtca.space', roleZh: 'Dozzle，log.app.nbtca.space', http: 'https://log.app.nbtca.space' },
      {
        id: 'auth-admin',
        name: 'Sign-on admin',
        zh: '统一登录后台',
        role: 'Logto Console, auth-admin.app.nbtca.space',
        roleZh: 'Logto Console，auth-admin.app.nbtca.space',
        http: 'https://auth-admin.app.nbtca.space/console',
      },
      {
        id: 'headscale',
        name: 'Private network',
        zh: '虚拟组网',
        role: 'Headscale, headscale.app.nbtca.space',
        roleZh: 'Headscale，headscale.app.nbtca.space',
        http: 'https://headscale.app.nbtca.space',
      },
    ],
  },
  {
    name: 'Mirrors',
    zh: '镜像代理',
    infra: true,
    items: [
      { id: 'docker-mirror', name: 'Docker Hub mirror', zh: 'Docker Hub 代理', role: 'docker.mirror.nbtca.space', http: 'https://docker.mirror.nbtca.space/v2/', status: 401 },
      { id: 'ghcr-mirror', name: 'GHCR mirror', zh: 'GHCR 代理', role: 'ghcr.mirror.nbtca.space', http: 'https://ghcr.mirror.nbtca.space/v2/', status: 401 },
    ],
  },
  {
    name: 'Legacy',
    zh: '旧版服务',
    infra: true,
    items: [
      {
        id: 'repair',
        name: 'Old repair console',
        zh: '旧版维修后台',
        role: 'Sunday, no longer developed. Repairs are now reported at nbtca.space/repair',
        roleZh: 'Sunday，已停止开发，报修请前往 nbtca.space/repair',
        http: 'https://repair.nbtca.space',
      },
    ],
  },
] satisfies Group[]
