import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

/**
 * QUANG WEBAPP FACTORY — LOOP DOCTOR, REMAKE PARITY & CLOUDFLARE TRUST-BOUNDARY PREFLIGHT
 * Hợp nhất 4 tầng kiểm toán:
 *  1. cobusgreyling/loop-engineering (STATE.md + LOOP.md + gate.yaml maxFiles/denylist)
 *  2. alan2207/bulletproof-react & obra/superpowers (Chống phình file .tsx >250 dòng, cấm any, cấm import chéo feature)
 *  3. cloudflare/security-audit-skill (Quét lộ bí mật Client, XSS sink, kiểm tra bắt buộc Supabase RLS)
 *  4. quang-reverse-to-remake (Tự động kiểm toán tiến độ RECONSTRUCTION-LEDGER.md nếu là dự án Remake!)
 */

const ROOT = process.cwd();
let score = 100;
const issues = [];
const warnings = [];

function penalize(points, msg, isWarning = false) {
  score = Math.max(0, score - points);
  if (isWarning) warnings.push(`⚠ [-${points}đ] ${msg}`);
  else issues.push(`✖ [-${points}đ] ${msg}`);
}

function walkFiles(dir, result = []) {
  if (!fs.existsSync(dir)) return result;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', 'dist', '.git', 'playwright-report', 'test-results'].includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkFiles(full, result);
    else result.push(full);
  }
  return result;
}

console.log('======================================================================');
console.log('  QUANG WEBAPP DOCTOR — KIEM TOAN VONG LAP, REMAKE & BAO MAT');
console.log('======================================================================\n');

// 1. Kiểm tra khung xương Loop Engineering
for (const requiredFile of ['STATE.md', 'LOOP.md', 'gate.yaml']) {
  if (!fs.existsSync(path.join(ROOT, requiredFile))) {
    penalize(15, `Thiếu file khung xương bảo trì dài hạn: ${requiredFile}`);
  }
}

// 2. Nếu là dự án Remake (có RECONSTRUCTION-LEDGER.md), kiểm toán tiến độ Nghĩa Vụ Phục Dựng
const ledgerPath = path.join(ROOT, 'RECONSTRUCTION-LEDGER.md');
if (fs.existsSync(ledgerPath)) {
  const ledger = fs.readFileSync(ledgerPath, 'utf8');
  const doneMatches = ledger.match(/^\|\s*OBL-\d+.*\|\s*\[x\]\s*\|/gim) || [];
  const pendingMatches = ledger.match(/^\|\s*OBL-\d+.*\|\s*\[\s\]\s*\|/gim) || [];
  const unknownMatches = ledger.match(/\bUNKNOWN\b/g) || [];
  const totalObl = doneMatches.length + pendingMatches.length;

  console.log(
    `[CHẾ ĐỘ REMAKE TỪ REVERSE] Tiến độ Sổ Nghĩa Vụ (RECONSTRUCTION-LEDGER.md): ${doneMatches.length}/${totalObl} hạng mục hoàn tất.`
  );
  if (unknownMatches.length > 0) {
    warnings.push(
      `ℹ RECONSTRUCTION-LEDGER.md còn ${unknownMatches.length} điểm đánh dấu UNKNOWN cần chốt từ bằng chứng gốc.`
    );
  }
}

// 3. Kiểm tra phạm vi thay đổi Git so với gate.yaml (maxFiles = 10)
try {
  const gitStatus = execSync('git status --porcelain', { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] })
    .toString()
    .trim();
  if (gitStatus) {
    const changedLines = gitStatus.split('\n').filter(Boolean);
    if (changedLines.length > 10) {
      penalize(
        10,
        `Lát cắt hiện tại đang sửa ${changedLines.length} file (> giới hạn maxFiles: 10 trong gate.yaml). Hãy chia nhỏ commit!`,
        true
      );
    }
  }
} catch {
  warnings.push('ℹ Chưa khởi tạo Git hoặc không đọc được trạng thái Git.');
}

// 4. Kiểm tra Kiến trúc Bulletproof-React & Chống phình file lớn trong src/
const srcFiles = walkFiles(path.join(ROOT, 'src')).filter((f) => /\.(ts|tsx)$/.test(f));
for (const file of srcFiles) {
  const rel = path.relative(ROOT, file).replace(/\\/g, '/');
  const content = fs.readFileSync(file, 'utf8');
  const lines = content.split('\n').length;

  if (lines > 450) {
    penalize(
      12,
      `${rel} phình quá lớn (${lines} dòng > 450 dòng)! Bắt buộc tách nhỏ vào src/features/<ten>/components/ để không mục nát dự án!`
    );
  } else if (lines > 250) {
    penalize(5, `${rel} dài ${lines} dòng (> 250 dòng). Nên tách nhỏ component/hook để dễ bảo trì lâu dài.`, true);
  }

  if (/:\s*any\b|\bas\s+any\b/.test(content)) {
    penalize(8, `${rel} có sử dụng kiểu 'any' — vi phạm cổng kiểm tra kiểu nghiêm ngặt.`);
  }

  // Kiểm tra import chéo giữa hai features khác nhau
  const featureMatch = rel.match(/^src\/features\/([^/]+)\//);
  if (featureMatch) {
    const currentFeature = featureMatch[1];
    const crossImports = [...content.matchAll(/from\s+['"]@\/features\/([^/'"]+)\/([^'"]+)['"]/g)];
    for (const m of crossImports) {
      if (m[1] !== currentFeature) {
        penalize(15, `${rel} import chéo trực tiếp ruột của feature '${m[1]}' (${m[2]}). Phải đi qua cổng index.ts hoặc tầng App!`);
      }
    }
  }

  // 5. Kiểm toán Bảo mật Biên Client (Cloudflare Security Audit principles)
  if (/SERVICE_ROLE_KEY|SUPABASE_SERVICE_ROLE|sk-[a-zA-Z0-9]{20,}|postgres:\/\//.test(content)) {
    penalize(30, `[BAO MAT NGHIEM TRONG] ${rel} có dấu hiệu chứa khóa bí mật Server/Database ngay trong mã nguồn Frontend!`);
  }

  if (/dangerouslySetInnerHTML|eval\s*\(/.test(content)) {
    penalize(12, `[CANH BAO XSS] ${rel} dùng dangerouslySetInnerHTML hoặc eval() — cần kiểm chứng biên đầu vào.`, true);
  }
}

// 6. Kiểm tra bắt buộc bật Row Level Security (RLS) trong mọi bảng SQL
const sqlFiles = walkFiles(path.join(ROOT, 'database')).filter((f) => f.endsWith('.sql'));
for (const sqlFile of sqlFiles) {
  const rel = path.relative(ROOT, sqlFile).replace(/\\/g, '/');
  const sql = fs.readFileSync(sqlFile, 'utf8');
  const createCount = (sql.match(/CREATE\s+TABLE/gi) || []).length;
  const rlsCount = (sql.match(/ENABLE\s+ROW\s+LEVEL\s+SECURITY/gi) || []).length;
  if (createCount > rlsCount) {
    penalize(25, `[BAO MAT RLS] ${rel} tạo ${createCount} bảng nhưng chỉ bật RLS cho ${rlsCount} bảng!`);
  }
}

console.log(`✔ Đã quét ${srcFiles.length} file mã nguồn TypeScript & ${sqlFiles.length} file SQL.`);
if (issues.length === 0 && warnings.length === 0) {
  console.log('✔ Không phát hiện bất kỳ lỗi kiến trúc, vượt rào gate.yaml hay lỗ hổng biên bảo mật nào!');
} else {
  for (const i of issues) console.log(i);
  for (const w of warnings) console.log(w);
}

console.log(`\n=> ĐIỂM SỨC KHỎE & ĐỘ BỀN DỰ ÁN (LOOP READY SCORE): ${score}/100\n`);
if (issues.length > 0) {
  process.exit(1);
}
