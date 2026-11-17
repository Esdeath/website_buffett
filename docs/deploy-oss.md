# 发布：阿里云 OSS + CDN

`buffett.ayaseeri.com` 的生产托管方式：私有 OSS bucket `buffett-site-cn` + 阿里云 CDN（杭州节点），
证书为 Let's Encrypt（acme.sh 手动 DNS 签发后上传到 CDN）。

## 一次性配置（已完成）

1. **OSS bucket**：`buffett-site-cn`，region `cn-hangzhou`，ACL 私有。
2. **静态网站托管**：`IndexDocument=index.html`、`ErrorDocument=404.html`，
   配置在 `scripts/oss-website.xml`，发布时由脚本写入。
3. **CDN 加速域名**：`buffett.ayaseeri.com`，源站类型 OSS，指向 `buffett-site-cn.oss-cn-hangzhou.aliyuncs.com`；
   开启私有 bucket 回源（`oss_auth` / `l2_oss_key`）、边缘函数 `private_oss_index`、HTTPS 强制跳转与 TLS 1.3。
4. **私有 bucket 回源授权**：CDN 服务关联角色 `AliyunCDNAccessingPrivateOSSRole`
   已挂自定义策略 `ayaseeri-buffett-munger-cdn-readonly`（只读这两个 bucket）。
5. **DNS**：`buffett.ayaseeri.com` CNAME 到 `buffett.ayaseeri.com.w.cdngslb.com`，TTL 600。
6. **发布配置**：仓库根目录 `.env`（已 gitignore，示例见 `.env.example`）：
   `ALIYUN_OSS_BUCKET`、`OSS_REGION`、`ALIYUN_CLI_PROFILE`、`ALIYUN_CDN_URL`。

## 日常发布

```bash
npm run deploy:oss          # 构建 + 上传 dist/ + 刷新 CDN
npm run deploy:oss:upload   # 直接用现有 dist/ 上传（不再构建）
```

脚本：`site/scripts/deploy-oss.mjs`。上传规则：整站 `aliyun oss cp -r`；
`*.json`、`*.md` 再覆盖一次带 `charset=utf-8` 的 Content-Type；发布后刷新整目录 CDN 缓存。

## 证书续期

```bash
~/.acme.sh/acme.sh --issue --dns -d buffett.ayaseeri.com --yes-I-know-dns-manual-mode-enough-go-ahead-please
# 按输出把 TXT 记录加到 _acme-challenge.buffett
aliyun --profile codex-oss alidns AddDomainRecord --DomainName ayaseeri.com \
  --RR _acme-challenge.buffett --Type TXT --Value '<challenge>' --TTL 600
~/.acme.sh/acme.sh --renew -d buffett.ayaseeri.com --yes-I-know-dns-manual-mode-enough-go-ahead-please
aliyun --profile codex-oss cdn SetCdnDomainSSLCertificate --DomainName buffett.ayaseeri.com --SSLProtocol on \
  --CertType upload --CertName "buffett.ayaseeri.com-letsencrypt-$(date +%Y%m%d)" \
  --SSLPub "$(cat ~/.acme.sh/buffett.ayaseeri.com_ecc/fullchain.cer)" \
  --SSLPri "$(cat ~/.acme.sh/buffett.ayaseeri.com_ecc/buffett.ayaseeri.com.key)"
```

## 验收

```bash
curl -sI https://buffett.ayaseeri.com/ | head -5
curl -s -o /dev/null -w '%{http_code}\n' https://buffett.ayaseeri.com/nonexistent-xyz   # 404
curl -s -o /dev/null -w '%{http_code}\n' https://buffett.ayaseeri.com/about/
```
