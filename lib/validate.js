/* =====================================================================
   Input validation & sanitization for the org-structure document.
   Prevents unbounded/oversized payloads and constrains the shape so a
   malformed-but-array body can't slip through (audit finding KU-11).
   ===================================================================== */
'use strict';

const LIMITS = {
  maxDepth: 6,
  maxNodes: 5000,
  maxString: 5000,          // names/roles/desc
  maxBio: 20000,
  maxImage: 8 * 1024 * 1024, // ~8MB per base64 image string
};

function isString(v) { return typeof v === 'string'; }

// Allow only image data URIs or http(s)/relative URLs for media fields.
function cleanImage(v, errs, where) {
  if (!isString(v) || v === '') return '';
  if (v.length > LIMITS.maxImage) { errs.push(`${where}: image too large`); return ''; }
  const ok = /^data:image\/(png|jpe?g|gif|webp|avif);base64,/i.test(v) ||
             /^https?:\/\//i.test(v) ||
             /^\/[^\s]*$/.test(v);
  if (!ok) { errs.push(`${where}: unsupported image source`); return ''; }
  // Explicitly reject SVG data URIs (can carry scripts).
  if (/^data:image\/svg/i.test(v)) { errs.push(`${where}: svg not allowed`); return ''; }
  return v;
}

function cleanStr(v, max, where, errs) {
  if (v === undefined || v === null) return '';
  if (!isString(v)) { errs.push(`${where}: expected string`); return ''; }
  if (v.length > max) { errs.push(`${where}: too long`); return v.slice(0, max); }
  return v;
}

function validateMember(m, errs, counter) {
  if (++counter.n > LIMITS.maxNodes) throw new Error('too many nodes');
  return {
    id: cleanStr(m.id, 64, 'member.id', errs),
    name: cleanStr(m.name, LIMITS.maxString, 'member.name', errs),
    role: cleanStr(m.role, LIMITS.maxString, 'member.role', errs),
    photo: cleanImage(m.photo, errs, 'member.photo'),
    bio: cleanStr(m.bio, LIMITS.maxBio, 'member.bio', errs),
    phone: cleanStr(m.phone, 128, 'member.phone', errs),
    email: cleanStr(m.email, 256, 'member.email', errs),
    telegram: cleanStr(m.telegram, 256, 'member.telegram', errs),
    posts: Array.isArray(m.posts) ? m.posts.slice(0, 200) : [],
  };
}

function validateNode(node, depth, errs, counter) {
  if (depth > LIMITS.maxDepth) throw new Error('structure too deep');
  if (++counter.n > LIMITS.maxNodes) throw new Error('too many nodes');
  const out = {
    id: cleanStr(node.id, 64, 'dept.id', errs),
    name: cleanStr(node.name, LIMITS.maxString, 'dept.name', errs),
    icon: cleanStr(node.icon, 64, 'dept.icon', errs),
    desc: cleanStr(node.desc, LIMITS.maxString, 'dept.desc', errs),
    children: [],
    members: [],
  };
  if (Array.isArray(node.children)) {
    for (const c of node.children) out.children.push(validateNode(c, depth + 1, errs, counter));
  }
  if (Array.isArray(node.members)) {
    for (const m of node.members) out.members.push(validateMember(m, errs, counter));
  }
  return out;
}

/* Returns { ok, data, errors }. Never throws to the caller. */
function validateStructure(body) {
  const errs = [];
  const counter = { n: 0 };
  if (!body || typeof body !== 'object' || !Array.isArray(body.depts)) {
    return { ok: false, errors: ['bad data: `depts` array required'] };
  }
  try {
    const data = {
      logo: cleanImage(body.logo, errs, 'logo'),
      bgVideo: cleanStr(body.bgVideo, 4096, 'bgVideo', errs),
      depts: body.depts.map((d) => validateNode(d, 1, errs, counter)),
    };
    return { ok: true, data, errors: errs };
  } catch (e) {
    return { ok: false, errors: [e.message] };
  }
}

module.exports = { validateStructure, LIMITS };
