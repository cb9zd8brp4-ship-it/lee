# Lee Reader｜私人同步数据库部署记录

- 日期：2026-11-11
- Supabase 项目：Lee Reader
- 区域：ap-northeast-1
- 项目 URL：https://yqvdfsjjbdxosnoajkpt.supabase.co
- 公开客户端 publishable Key：`sb_publishable_NYmOLRbMC6zhQVSWc01_Bw_c2nnVixg`
- 报价：0 美元/月（当前免费额度）
- 状态：ACTIVE_HEALTHY（已验证）
- 数据表：public.reader_events；RLS 已开启，匿名角色无 SELECT 权限，读取、插入、修改必须满足 auth.uid() = user_id
- 可选当前书籍：reader-current 私有存储桶，文件最大 10 MiB，用户 UID 文件夹隔离
- 安全 Advisor：无告警
- 验证：已查询权限表、实际 SQL 策略、桶属性和数据库状态；尚未执行真实用户多设备端到端登录和写入测试

**不要将密码、service_role 或 secret key 提交到 GitHub。** 项目配置仅含允许公开的 URL 和 publishable Key。

客户端端到端同步、书籍包 APK 实际构建和红米安装仍待验收。正式主分支 main 未改变。