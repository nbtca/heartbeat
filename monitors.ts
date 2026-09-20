import type { Group } from './src/types.ts'

export default [
  {
    name: 'Websites & docs',
    zh: '网站与文档',
    items: [
      { id: 'home', name: 'nbtca.space', role: 'Association website', zh: '协会官网', http: 'https://nbtca.space' },
      { id: 'docs', name: 'docs.nbtca.space', role: 'Handbook and guides', zh: '协会文档', http: 'https://docs.nbtca.space' },
      { id: 'blogs', name: 'blogs.nbtca.space', role: 'Member blog', zh: '计协博客', http: 'https://blogs.nbtca.space' },
    ],
  },
  {
    name: 'Repair service',
    zh: '维修服务',
    items: [
      { id: 'repair', name: 'Repair booking', role: 'Sunday, repair.nbtca.space', zh: 'Sunday，repair.nbtca.space', http: 'https://repair.nbtca.space' },
      { id: 'api', name: 'Repair API', role: 'Saturday, api.nbtca.space', zh: 'Saturday，api.nbtca.space', http: 'https://api.nbtca.space/ping' },
    ],
  },
  {
    name: 'Accounts',
    zh: '账号',
    items: [
      {
        id: 'auth',
        name: 'Single sign-on',
        role: 'Logto, auth.app.nbtca.space',
        zh: 'Logto，auth.app.nbtca.space',
        http: 'https://auth.app.nbtca.space/oidc/.well-known/openid-configuration',
      },
      { id: 'myid', name: 'Account dashboard', role: 'Logto-USS, myid.app.nbtca.space', zh: 'Logto-USS，myid.app.nbtca.space', http: 'https://myid.app.nbtca.space' },
      { id: 'github-oauth', name: 'GitHub sign-in', role: 'github-oauth.nbtca.space', http: 'https://github-oauth.nbtca.space' },
    ],
  },
  {
    name: 'Apps',
    zh: '应用',
    items: [
      { id: 'icloud', name: 'Shared drive', role: 'icloud.nbtca.space', http: 'https://icloud.nbtca.space' },
      { id: 'link', name: 'Short links', role: 'shortlink, link.nbtca.space', zh: 'shortlink，link.nbtca.space', http: 'https://link.nbtca.space', status: 400 },
      { id: 'ical', name: 'Timetable feed', role: 'calendar, ical.nbtca.space', zh: 'calendar，ical.nbtca.space', http: 'https://ical.nbtca.space', head: true },
      { id: 'papers', name: 'Exam papers', role: 'papers.dev.nbtca.space', http: 'https://papers.dev.nbtca.space' },
    ],
  },
  {
    name: 'Games',
    zh: '游戏',
    items: [{ id: 'mc', name: 'Minecraft', role: 'orangedog.nbtca.space:25565', tcp: 'orangedog.nbtca.space:25565' }],
  },
  {
    name: 'Messaging & storage',
    zh: '消息与存储',
    infra: true,
    items: [
      {
        id: 'webhook',
        name: 'Notification webhooks',
        role: 'ServerlessMQ, webhook.nbtca.space',
        zh: 'ServerlessMQ，webhook.nbtca.space',
        http: 'https://webhook.nbtca.space',
      },
      { id: 'mq', name: 'Message queue', role: 'ServerlessMQ, mq.nbtca.space', zh: 'ServerlessMQ，mq.nbtca.space', http: 'https://mq.nbtca.space' },
      { id: 'oss', name: 'Object storage', role: 'Aliyun OSS, oss.nbtca.space', zh: '阿里云 OSS，oss.nbtca.space', http: 'https://oss.nbtca.space', status: 403 },
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
        role: 'Traefik, traefik.app.nbtca.space',
        zh: 'Traefik，traefik.app.nbtca.space',
        http: 'https://traefik.app.nbtca.space/api/overview',
      },
      {
        id: 'consul',
        name: 'Service discovery',
        role: 'Consul, consul.app.nbtca.space',
        zh: 'Consul，consul.app.nbtca.space',
        http: 'https://consul.app.nbtca.space/v1/status/leader',
      },
      {
        id: 'prometheus',
        name: 'Metrics',
        role: 'Prometheus, prometheus.app.nbtca.space',
        zh: 'Prometheus，prometheus.app.nbtca.space',
        http: 'https://prometheus.app.nbtca.space/-/healthy',
        status: 401,
      },
      { id: 'logs', name: 'Log viewer', role: 'log.app.nbtca.space', http: 'https://log.app.nbtca.space' },
      {
        id: 'auth-admin',
        name: 'Sign-on admin',
        role: 'Logto Console, auth-admin.app.nbtca.space',
        zh: 'Logto Console，auth-admin.app.nbtca.space',
        http: 'https://auth-admin.app.nbtca.space/console',
      },
      {
        id: 'headscale',
        name: 'Private network',
        role: 'Headscale, headscale.app.nbtca.space',
        zh: 'Headscale，headscale.app.nbtca.space',
        http: 'https://headscale.app.nbtca.space',
      },
    ],
  },
  {
    name: 'Mirrors',
    zh: '镜像站',
    infra: true,
    items: [
      { id: 'docker-mirror', name: 'Docker Hub mirror', role: 'docker.mirror.nbtca.space', http: 'https://docker.mirror.nbtca.space/v2/', status: 401 },
      { id: 'ghcr-mirror', name: 'GHCR mirror', role: 'ghcr.mirror.nbtca.space', http: 'https://ghcr.mirror.nbtca.space/v2/', status: 401 },
    ],
  },
] satisfies Group[]
