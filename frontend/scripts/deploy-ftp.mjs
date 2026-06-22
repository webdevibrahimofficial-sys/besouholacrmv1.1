import fs from "fs";
import path from "path";
import { Client } from "basic-ftp";

function getBuiltAssetNames(localDir) {
  const assetsDir = path.join(localDir, "assets");
  if (!fs.existsSync(assetsDir)) {
    return { jsFiles: [], cssFiles: [] };
  }

  const assetNames = fs.readdirSync(assetsDir);
  return {
    jsFiles: assetNames.filter((name) => name.endsWith(".js")),
    cssFiles: assetNames.filter((name) => name.endsWith(".css")),
  };
}

async function main() {
  const configPath = path.resolve(".vscode", "sftp.json");
  const raw = fs.readFileSync(configPath, "utf8");
  const cfg = JSON.parse(raw);
  const client = new Client();
  try {
    await client.access({
      host: cfg.host,
      port: cfg.port,
      user: cfg.username,
      password: cfg.password,
      secure: false,
    });
    let remote = cfg.remotePath || "/";
    if (remote !== "/") {
      await client.ensureDir(remote);
      await client.cd(remote);
    }
    const entries = await client.list();
    const domainDir = entries.find((e) => e.isDirectory && e.name.toLowerCase().includes("besouhola.com"));
    if (domainDir) {
      await client.cd(domainDir.name);
      remote = path.posix.join(remote, domainDir.name);
    }
    const localDir = path.resolve("dist");
    const { jsFiles, cssFiles } = getBuiltAssetNames(localDir);
    await client.uploadFromDir(localDir);
    const items = await client.list();
    const names = items.map((i) => i.name);
    const ok = names.includes("index.html") && names.includes("assets");
    let assetsOk = false;
    if (ok) {
      await client.cd("assets");
      const a = await client.list();
      const remoteAssetNames = a.map((item) => item.name);
      assetsOk =
        jsFiles.every((name) => remoteAssetNames.includes(name)) &&
        cssFiles.every((name) => remoteAssetNames.includes(name));
      const pingPath = path.resolve(".ping.txt");
      fs.writeFileSync(pingPath, "pong");
      await client.uploadFrom(pingPath, "_ping.txt");
      fs.unlinkSync(pingPath);
      try {
        await client.cd("..");
        await client.send("SITE CHMOD 644 index.html");
        await client.send("SITE CHMOD 755 assets");
        await client.cd("assets");
        for (const jsFile of jsFiles) {
          await client.send(`SITE CHMOD 644 ${jsFile}`);
        }
        for (const cssFile of cssFiles) {
          await client.send(`SITE CHMOD 644 ${cssFile}`);
        }
        await client.send("SITE CHMOD 644 _ping.txt");
      } catch {}
      await client.cd("..");
    }
    const rootPingPath = path.resolve(".ping-root.txt");
    fs.writeFileSync(rootPingPath, "pong-root");
    await client.uploadFrom(rootPingPath, "_root_ping.txt");
    fs.unlinkSync(rootPingPath);
    const candidates = [
      path.posix.join(remote, "besouhola.com"),
      path.posix.join(remote, "www.besouhola.com"),
      "/domains/besouhola.com/public_html",
      "/besouhola.com",
    ];
    for (const candidate of candidates) {
      try {
        await client.cd(candidate);
        await client.ensureDir(candidate);
        await client.uploadFromDir(localDir);
        await client.send("SITE CHMOD 644 index.html");
        try {
          await client.send("SITE CHMOD 755 assets");
          await client.cd("assets");
          for (const jsFile of jsFiles) {
            await client.send(`SITE CHMOD 644 ${jsFile}`);
          }
          for (const cssFile of cssFiles) {
            await client.send(`SITE CHMOD 644 ${cssFile}`);
          }
          await client.cd("..");
        } catch {}
        await client.cd(remote);
      } catch {}
    }
    console.log(ok && assetsOk ? "uploaded" : "upload_incomplete");
  } finally {
    client.close();
  }
}

main().catch((e) => {
  process.exitCode = 1;
});
