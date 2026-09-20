import type { Group } from './src/types.ts'

export default [
  {
    name: '网站与文档',
    items: [
      { id: 'home', name: '官网', http: 'https://nbtca.space' },
      { id: 'docs', name: '文档', http: 'https://docs.nbtca.space' },
      { id: 'blogs', name: '博客', http: 'https://blogs.nbtca.space' },
    ],
  },
  {
    name: '维修服务',
    items: [
      { id: 'repair', name: '维修预约', http: 'https://repair.nbtca.space' },
      { id: 'api', name: '维修 API', http: 'https://api.nbtca.space/ping' },
    ],
  },
  {
    name: '账号',
    items: [
      { id: 'auth', name: '统一认证', http: 'https://auth.app.nbtca.space/oidc/.well-known/openid-configuration' },
      { id: 'myid', name: '个人中心', http: 'https://myid.app.nbtca.space' },
      { id: 'github-oauth', name: 'GitHub 登录', http: 'https://github-oauth.nbtca.space' },
    ],
  },
  {
    name: '工具',
    items: [
      { id: 'ical', name: '日历订阅', http: 'https://ical.nbtca.space' },
      { id: 'webhook', name: '消息推送', http: 'https://webhook.nbtca.space' },
      { id: 'headscale', name: '内网组网', http: 'https://headscale.app.nbtca.space' },
      { id: 'oss', name: '对象存储', http: 'https://oss.nbtca.space', status: 403 },
    ],
  },
  {
    name: '镜像站',
    items: [
      { id: 'docker-mirror', name: 'Docker Hub 镜像', http: 'https://docker.mirror.nbtca.space/v2/', status: 401 },
      { id: 'ghcr-mirror', name: 'GHCR 镜像', http: 'https://ghcr.mirror.nbtca.space/v2/', status: 401 },
    ],
  },
  {
    name: '游戏',
    items: [{ id: 'mc', name: 'Minecraft 服务器', tcp: 'orangedog.nbtca.space:25565' }],
  },
] satisfies Group[]
