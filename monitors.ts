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
      { id: 'oss', name: 'Object storage', zh: '对象存储', http: 'https://oss.nbtca.space', status: 403 },
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
