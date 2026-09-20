import type { Group } from './src/types.ts'

export default [
  {
    name: 'Websites & docs',
    zh: '网站与文档',
    items: [
      { id: 'home', name: 'Website', zh: '官网', http: 'https://nbtca.space' },
      { id: 'docs', name: 'Documentation', zh: '文档', http: 'https://docs.nbtca.space' },
      { id: 'blogs', name: 'Blog', zh: '博客', http: 'https://blogs.nbtca.space' },
    ],
  },
  {
    name: 'Repair service',
    zh: '维修服务',
    items: [
      { id: 'repair', name: 'Repair booking', zh: '维修预约', http: 'https://repair.nbtca.space' },
      { id: 'api', name: 'Repair API', zh: '维修 API', http: 'https://api.nbtca.space/ping' },
    ],
  },
  {
    name: 'Accounts',
    zh: '账号',
    items: [
      { id: 'auth', name: 'Single sign-on', zh: '统一认证', http: 'https://auth.app.nbtca.space/oidc/.well-known/openid-configuration' },
      { id: 'myid', name: 'Account dashboard', zh: '个人中心', http: 'https://myid.app.nbtca.space' },
    ],
  },
  {
    name: 'Apps',
    zh: '应用',
    items: [
      { id: 'icloud', name: 'Drive', zh: '网盘', http: 'https://icloud.nbtca.space' },
      { id: 'papers', name: 'Exam papers', zh: '试卷管理', http: 'https://papers.dev.nbtca.space' },
      { id: 'link', name: 'Short links', zh: '短链接', http: 'https://link.nbtca.space', status: 400 },
    ],
  },
  {
    name: 'Games',
    zh: '游戏',
    items: [{ id: 'mc', name: 'Minecraft server', zh: 'Minecraft 服务器', tcp: 'orangedog.nbtca.space:25565' }],
  },
  {
    name: 'APIs & tools',
    zh: '接口与工具',
    infra: true,
    items: [
      { id: 'github-oauth', name: 'GitHub sign-in', zh: 'GitHub 登录', http: 'https://github-oauth.nbtca.space' },
      { id: 'ical', name: 'Calendar feed', zh: '日历订阅', http: 'https://ical.nbtca.space' },
      { id: 'webhook', name: 'Notification center', zh: '消息推送', http: 'https://webhook.nbtca.space' },
      { id: 'mq', name: 'Message queue', zh: '消息队列', http: 'https://mq.nbtca.space' },
      { id: 'oss', name: 'Object storage', zh: '对象存储', http: 'https://oss.nbtca.space', status: 403 },
    ],
  },
  {
    name: 'Platform',
    zh: '平台',
    infra: true,
    items: [
      { id: 'traefik', name: 'Ingress gateway', zh: '入口网关', http: 'https://traefik.app.nbtca.space/api/overview' },
      { id: 'consul', name: 'Service discovery', zh: '服务发现', http: 'https://consul.app.nbtca.space/v1/status/leader' },
      { id: 'prometheus', name: 'Metrics', zh: '指标采集', http: 'https://prometheus.app.nbtca.space/-/healthy', status: 401 },
      { id: 'logs', name: 'Logs', zh: '日志', http: 'https://log.app.nbtca.space' },
      { id: 'auth-admin', name: 'Sign-on admin', zh: '认证管理', http: 'https://auth-admin.app.nbtca.space/console' },
      { id: 'headscale', name: 'Private network', zh: '内网组网', http: 'https://headscale.app.nbtca.space' },
    ],
  },
  {
    name: 'Mirrors',
    zh: '镜像站',
    infra: true,
    items: [
      { id: 'docker-mirror', name: 'Docker Hub mirror', zh: 'Docker Hub 镜像', http: 'https://docker.mirror.nbtca.space/v2/', status: 401 },
      { id: 'ghcr-mirror', name: 'GHCR mirror', zh: 'GHCR 镜像', http: 'https://ghcr.mirror.nbtca.space/v2/', status: 401 },
    ],
  },
] satisfies Group[]
