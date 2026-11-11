// The website is distributed independently of the npm library; retain its dependency notices.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url));
const lock = JSON.parse(
  fs.readFileSync(path.join(root, "package-lock.json"), "utf8"),
);
const sections = [
  "rtex-ts website third-party licenses\n\nThe rtex-ts library and upstream provenance notices are linked in the documentation.\nThese notices cover the independently built website dependencies.",
];
for (const [folder, entry] of Object.entries(lock.packages)) {
  if (!folder || entry.dev || entry.link) continue;
  const dir = path.join(root, folder);
  if (!fs.existsSync(dir)) continue;
  const pkg = JSON.parse(
    fs.readFileSync(path.join(dir, "package.json"), "utf8"),
  );
  const notices = fs
    .readdirSync(dir)
    .filter(
      (name) =>
        /^(licen[cs]e|copying|notice)([.\-_]|$)/i.test(name) &&
        fs.statSync(path.join(dir, name)).isFile(),
    );
  let supplemental = "";
  if (
    !notices.length &&
    pkg.name === "@ant-design/icons-svg" &&
    pkg.version === "4.6.0"
  )
    supplemental = fs.readFileSync(
      path.join(root, "licenses/ant-design-icons-svg-4.6.0.LICENSE"),
      "utf8",
    );
  if (!notices.length && !supplemental) {
    const readme = path.join(dir, "README.md");
    if (fs.existsSync(readme)) {
      const text = fs.readFileSync(readme, "utf8"),
        start = text.search(/^## License\s*$/m);
      if (
        start >= 0 &&
        text.slice(start).includes("Permission is hereby granted")
      )
        supplemental = text.slice(start);
    }
  }
  if (!notices.length && !supplemental)
    throw new Error("Missing production dependency license: " + pkg.name);
  sections.push(
    `${pkg.name}@${pkg.version}\nLicense: ${typeof pkg.license === "string" ? pkg.license : JSON.stringify(pkg.license)}\n\n` +
      (supplemental ||
        notices
          .map((name) => fs.readFileSync(path.join(dir, name), "utf8"))
          .join("\n")),
  );
}
fs.writeFileSync(
  path.join(root, "dist/third-party-licenses.txt"),
  sections.join("\n\n" + "=".repeat(72) + "\n\n") + "\n",
);
console.log("Website third-party notices:", sections.length - 1, "packages");
