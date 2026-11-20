if (document.documentElement.classList.contains("js")) {
	const MIN_W = 640;
	let Z = 1;
	const dprNow = () => (devicePixelRatio || 1) * Z;
	function fit() {
		Z = Math.min(1, innerWidth / MIN_W);
		document.documentElement.style.setProperty("--z", Z);
	}
	fit();
	addEventListener("resize", fit);
	const $ = (id) => document.getElementById(id),
		still = matchMedia("(prefers-reduced-motion: reduce)").matches;
	const U = () =>
		parseFloat(
			getComputedStyle(document.documentElement).getPropertyValue("--u"),
		) || 2;
	const inkNow = () =>
		getComputedStyle(document.body)
			.color.match(/[\d.]+/g)
			.slice(0, 3)
			.map(Number);
	const HUE = [
		"#c1121c",
		"#d65d0e",
		"#d79921",
		"#c5ca30",
		"#8ac926",
		"#689d6a",
		"#1982c4",
		"#00387b",
		"#7f62a9",
		"#cb89a7",
	].map((h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)));
	const readable = (() => {
		try {
			const g = new OffscreenCanvas(8, 8).getContext("2d");
			g.fillStyle = "#c1121c";
			g.fillRect(0, 0, 8, 4);
			g.fillStyle = "#1982c4";
			g.fillRect(0, 4, 8, 4);
			const d = g.getImageData(0, 0, 8, 8).data;
			for (let i = 0; i < d.length; i += 4)
				if (
					d.slice(i, i + 4).join() !==
					(i < 128 ? "193,18,28,255" : "25,130,196,255")
				)
					return false;
			return true;
		} catch {
			return false;
		}
	})();
	const S = {};
	const SHEET = {
		"albedo-word": [1270, 39, 47, 11],
		edge: [2, 39, 88, 31],
		hat: [94, 39, 88, 31],
		"hat-handle": [1421, 39, 53, 9],
		"hat-teq": [1531, 39, 13, 9],
		"nixos-caps": [62, 74, 40, 5],
		"nixos-flake": [2, 2, 1584, 33],
		"possums-caps": [2, 74, 56, 6],
		"possums-now": [1321, 39, 36, 11],
		"possums-photo": [738, 39, 24, 23],
		"shatter-logo": [766, 39, 112, 16],
		"shatter-word": [1361, 39, 56, 9],
		"tranquil-word": [1478, 39, 49, 9],
	};
	let atlas;
	async function sheet(file, { frame = 0, mask = false, key = null } = {}) {
		atlas ??= (async () => {
			const im = new Image();
			im.src = "img/sprites.webp";
			await im.decode();
			const g = new OffscreenCanvas(im.width, im.height).getContext("2d");
			g.drawImage(im, 0, 0);
			return g.getImageData(0, 0, im.width, im.height);
		})();
		const { data: d, width: aw } = await atlas,
			[sx, sy, width, height] = SHEET[file],
			pal = {},
			of = {},
			chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789",
			all = [];
		for (let y = 0; y < height; y++) {
			let r = "";
			for (let x = 0; x < width; x++) {
				const o = ((sy + y) * aw + sx + x) * 4;
				if (d[o + 3] < 128) r += ".";
				else if (mask) r += "#";
				else {
					const hex = `#${[d[o], d[o + 1], d[o + 2]].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
					if (!(hex in of)) {
						of[hex] = key ? key[hex] : chars[Object.keys(pal).length];
						if (!of[hex]) throw new Error(`${file}: unexpected colour ${hex}`);
						pal[of[hex]] = hex;
					}
					r += of[hex];
				}
			}
			all.push(r);
		}
		const w = frame || width,
			frames = [];
		for (let x = 0; x < width; x += w)
			frames.push(all.map((r) => r.slice(x, x + w)));
		return { rows: frames[0], frames, pal };
	}
	let spritesIn = false;
	const sprites = () =>
		Promise.all([
			sheet("edge", { key: { "#000000": "x", "#ffffff": "r" } }).then((s) => {
				S.edge = s.rows;
			}),
			sheet("hat").then((s) => {
				S.hat = s.rows;
				S.hatPal = s.pal;
			}),
			sheet("hat-teq", { mask: true }).then((s) => {
				S.hatTeq = s.rows;
			}),
			sheet("hat-handle", { mask: true }).then((s) => {
				S.hatHandle = s.rows;
			}),
			sheet("shatter-logo", { frame: 16 }).then((s) => {
				S.ssFrames = s.frames;
				S.ssPal = s.pal;
			}),
			sheet("shatter-word", { mask: true }).then((s) => {
				S.ssWord = s.rows;
			}),
			sheet("tranquil-word", { mask: true }).then((s) => {
				S.tqWord = s.rows;
			}),
			sheet("albedo-word", { mask: true }).then((s) => {
				S.albedoWord = s.rows;
			}),
			sheet("possums-photo").then((s) => {
				S.pnPhoto = s.rows;
				S.pnPal = s.pal;
			}),
			sheet("possums-caps", { mask: true }).then((s) => {
				S.pnCaps = s.rows;
			}),
			sheet("possums-now", { mask: true }).then((s) => {
				S.pnNow = s.rows;
			}),
			sheet("nixos-flake", {
				frame: 33,
				key: { "#5b82cf": "d", "#86c3ee": "l" },
			}).then((s) => {
				S.nxFrames = s.frames;
			}),
			sheet("nixos-caps", { mask: true }).then((s) => {
				S.nxCaps = s.rows;
			}),
			document.fonts.ready,
		]);
	const TAU = 6.2832,
		PAPER = [0, null];
	function rng(s) {
		return () => {
			s =
				Math.imul(s ^ (s >>> 15), 2246822507) ^
				Math.imul(s ^ (s >>> 13), 3266489909);
			return (s >>> 0) / 4294967296;
		};
	}

	function voronoi(asp) {
		const cx = 0.5 * asp,
			cy = 0.42,
			R = rng(97),
			seeds = [];
		for (let k = 0; k < 26; k++) {
			const a = R() * TAU,
				q = 0.14 + R() ** 0.75 * 1.1;
			seeds.push([
				cx + Math.cos(a) * q,
				cy + Math.sin(a) * q,
				R(),
				HUE[Math.floor((a / TAU) * 10) % 10],
			]);
		}
		const near = (x, y) => {
			let d1 = 9,
				d2 = 9,
				i0 = 0;
			for (let i = 0; i < seeds.length; i++) {
				const e = Math.hypot(x - seeds[i][0], y - seeds[i][1]);
				if (e < d1) {
					d2 = d1;
					d1 = e;
					i0 = i;
				} else if (e < d2) d2 = e;
			}
			return [d1, d2, i0];
		};
		const f = (x, y) => {
			const d = Math.hypot(x - cx, y - cy),
				[d1, d2, i] = near(x, y),
				s0 = seeds[i];
			if (d2 - d1 < 0.009) return PAPER;
			const v = Math.min(
				1,
				0.1 + Math.max(0, 1 - d / 1.05) ** 1.7 * (0.3 + 0.75 * s0[2]) * 1.4,
			);
			return [v + (1 - v) * 0.7 * lit[i], s0[3]];
		};
		const lit = new Float32Array(seeds.length),
			bb = seeds.map(() => [9, 9, -9, -9]);
		for (let y = 0; y < 1; y += 0.01)
			for (let x = 0; x < asp; x += 0.01) {
				const b = bb[near(x, y)[2]];
				b[0] = Math.min(b[0], x);
				b[1] = Math.min(b[1], y);
				b[2] = Math.max(b[2], x);
				b[3] = Math.max(b[3], y);
			}
		f.tick = () => {
			const hk = P.in ? near(P.x, P.y)[2] : -1,
				boxes = [];
			let busy = false;
			for (let i = 0; i < seeds.length; i++) {
				const tgt = i === hk ? P.s : 0,
					o = lit[i];
				lit[i] += (tgt - lit[i]) * 0.14;
				if (Math.abs(lit[i] - tgt) < 0.01) lit[i] = tgt;
				if (lit[i] !== o) {
					const b = bb[i];
					if (b[2] >= b[0])
						boxes.push([b[0] - 0.02, b[1] - 0.02, b[2] + 0.02, b[3] + 0.02]);
					busy = true;
				}
			}
			return { boxes, busy };
		};
		return f;
	}

	function strata() {
		const order = [8, 7, 6, 5, 4, 3, 2, 1, 0],
			lit = new Float32Array(9);
		const edge = (k, x) =>
				0.3 +
				k * 0.082 +
				0.03 * Math.sin(x * (5 + k * 1.3) + k * 2.1) +
				0.014 * Math.sin(x * 13 + k * 1.7),
			band = (x, y) => {
				let k = -1;
				while (k < order.length - 1 && y > edge(k + 1, x)) k++;
				return k;
			};
		const f = (x, y) => {
			const k = band(x, y);
			if (k < 0) return PAPER;
			const top = edge(k, x),
				t = (y - top) / ((k < order.length - 1 ? edge(k + 1, x) : 1.02) - top),
				v = 0.96 - 0.8 * Math.min(1, t);
			return [v + (1 - v) * 0.45 * lit[k], HUE[order[k]]];
		};
		f.layers = () => {
			const hk = P.in ? band(P.x, P.y) : -1,
				spans = [];
			for (let k = 0; k < 9; k++) {
				const tgt = k === hk ? 1 : 0,
					o = lit[k];
				lit[k] += (tgt - lit[k]) * 0.16;
				if (Math.abs(lit[k] - tgt) < 0.01) lit[k] = tgt;
				if (lit[k] !== o)
					spans.push([0.25 + k * 0.082, k < 8 ? 0.35 + (k + 1) * 0.082 : 1.02]);
			}
			return spans;
		};
		return f;
	}
	const hash = (x, y, s) => {
		let h =
			Math.imul(x | 0, 374761393) +
			Math.imul(y | 0, 668265263) +
			Math.imul(s | 0, 1442695041);
		h = Math.imul(h ^ (h >>> 13), 1274126177);
		return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
	};
	const vnoise = (x, y, s) => {
		const xi = Math.floor(x),
			yi = Math.floor(y),
			xf = x - xi,
			yf = y - yi,
			u = xf * xf * (3 - 2 * xf),
			v = yf * yf * (3 - 2 * yf),
			a = hash(xi, yi, s),
			b = hash(xi + 1, yi, s),
			c = hash(xi, yi + 1, s),
			d = hash(xi + 1, yi + 1, s);
		return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
	};
	const fbm = (x, y, s, o = 4) => {
		let t = 0,
			a = 0.5,
			f = 1,
			n = 0;
		for (let i = 0; i < o; i++) {
			t += a * vnoise(x * f, y * f, s + i * 17);
			n += a;
			f *= 2;
			a *= 0.5;
		}
		return t / n;
	};
	const hueAt = (t) => HUE[((Math.floor(t) % 10) + 10) % 10],
		rgb = (c) => `rgb(${c[0]},${c[1]},${c[2]})`;
	function canvasPlate(cols, rows, draw, ink) {
		const c = document.createElement("canvas");
		c.width = cols;
		c.height = rows;
		const g = c.getContext("2d");
		g.scale(rows, rows);
		draw(g, cols / rows);
		const d = g.getImageData(0, 0, cols, rows).data,
			snap = [...HUE, ink];
		return (x, y) => {
			const i =
					(Math.min(rows - 1, Math.floor(y * rows)) * cols +
						Math.min(cols - 1, Math.floor(x * rows))) *
					4,
				a = d[i + 3] / 255;
			if (a < 0.02) return PAPER;
			const p = [d[i], d[i + 1], d[i + 2]];
			let best = snap[0],
				bd = 1e9;
			for (const s of snap) {
				const e = (s[0] - p[0]) ** 2 + (s[1] - p[1]) ** 2 + (s[2] - p[2]) ** 2;
				if (e < bd) {
					bd = e;
					best = s;
				}
			}
			return [a, best];
		};
	}
	const flow = (asp, ink, cols, rows) => {
		const paths = [];
		const lines = canvasPlate(
			cols,
			rows,
			(g, A) => {
				const R = rng(30);
				g.lineWidth = 1.1 / rows;
				g.lineCap = "round";
				for (let n = 0; n < 1700; n++) {
					let x = R() * A,
						y = R();
					const h = hueAt((x / A) * 10),
						pts = [x, y];
					g.strokeStyle = rgb(h);
					g.globalAlpha = 0.6 + 0.4 * R();
					g.beginPath();
					g.moveTo(x, y);
					for (let s = 0; s < 55; s++) {
						const a = fbm(x * 1.4, y * 1.4, 30, 3) * TAU * 1.6;
						x += Math.cos(a) * 0.008;
						y += Math.sin(a) * 0.008;
						g.lineTo(x, y);
						pts.push(x, y);
					}
					g.stroke();
					paths.push([h, pts]);
				}
			},
			ink,
		);
		const base = (x, y) => {
			const s = lines(x, y);
			return s[1] ? s : [0.14, hueAt((x / asp) * 10)];
		};
		const RR = 0.24,
			lit = new Map();
		let prev = null;
		const f = (x, y) => {
			if (P.s <= 0) return base(x, y);
			const d = Math.hypot(x - P.x, y - P.y);
			if (d >= RR) return base(x, y);
			const w = P.s * (1 - (d / RR) ** 2),
				h = lit.get(Math.floor(x * rows) + Math.floor(y * rows) * cols);
			if (h) return base(x, y);
			const b = base(x, y);
			return b[1] ? [b[0] * (1 - 0.85 * w), b[1]] : b;
		};
		f.tick = () => {
			const boxes = [],
				box = ([x, y]) => boxes.push([x - RR, y - RR, x + RR, y + RR]);
			if (prev) box(prev);
			lit.clear();
			if (P.s > 0) {
				const near = [];
				for (const [h, pts] of paths) {
					let best = 9;
					for (let k = 0; k < pts.length; k += 2) {
						const e = Math.hypot(pts[k] - P.x, pts[k + 1] - P.y);
						if (e < best) best = e;
					}
					if (best < 0.03) near.push([best, h, pts]);
				}
				near.sort((a, b) => a[0] - b[0]);
				for (const [, , pts] of near.slice(0, 14))
					for (let k = 2; k < pts.length; k += 2) {
						const ax = pts[k - 2],
							ay = pts[k - 1],
							bx = pts[k],
							by = pts[k + 1];
						if (Math.hypot(bx - P.x, by - P.y) > RR + 0.01) continue;
						const n = Math.ceil(Math.hypot(bx - ax, by - ay) * rows * 2) + 1;
						for (let t = 0; t <= n; t++) {
							const i = Math.floor((ax + ((bx - ax) * t) / n) * rows),
								j = Math.floor((ay + ((by - ay) * t) / n) * rows);
							lit.set(i + j * cols, 1);
							lit.set(i + 1 + j * cols, 1);
							lit.set(i + (j + 1) * cols, 1);
						}
					}
				prev = [P.x, P.y];
				box(prev);
			} else prev = null;
			return { boxes, busy: false };
		};
		return f;
	};
	const halftone = (asp) => {
		const a = 0.38,
			c = Math.cos(a),
			s = Math.sin(a),
			p = 0.032,
			R = 0.1,
			HOLD = 220,
			REGROW = 700,
			er = new Map();
		let last = 0;
		const f = (x, y) => {
			const u = (x * c - y * s) / p,
				v = (x * s + y * c) / p,
				iu = Math.round(u),
				iv = Math.round(v),
				cx = (iu * c + iv * s) * p,
				cy = (-iu * s + iv * c) * p;
			const t = fbm(cx * 1.5, cy * 1.5, 9, 3),
				r = Math.sqrt(t) * 0.62 * (1 - (er.get(`${iu},${iv}`)?.e || 0));
			return Math.hypot(u - iu, v - iv) < r
				? [
						0.3 + 0.7 * Math.max(0, (t - 0.15) / 0.7) ** 1.3,
						HUE[
							Math.max(
								0,
								Math.min(
									9,
									Math.floor(
										((cx / asp) * 0.8 +
											cy * 0.2 +
											0.6 * (fbm(cx * 0.8 + 5, cy * 0.8, 4, 3) - 0.5)) *
											9.6 +
											1.6 * (t - 0.5),
									),
								),
							)
						],
					]
				: PAPER;
		};
		f.tick = (now) => {
			const dt = last ? Math.min(64, now - last) : 16,
				boxes = [],
				h = p * 0.7,
				box = (cx, cy) => boxes.push([cx - h, cy - h, cx + h, cy + h]);
			last = now;
			if (P.s > 0) {
				const pu = (P.x * c - P.y * s) / p,
					pv = (P.x * s + P.y * c) / p,
					n = Math.ceil(R / p) + 1;
				for (let iu = Math.round(pu) - n; iu <= Math.round(pu) + n; iu++)
					for (let iv = Math.round(pv) - n; iv <= Math.round(pv) + n; iv++) {
						const cx = (iu * c + iv * s) * p,
							cy = (-iu * s + iv * c) * p,
							d = Math.hypot(cx - P.x, cy - P.y);
						if (d >= R) continue;
						const w = P.s * (1 - (d / R) ** 2) ** 1.5,
							k = `${iu},${iv}`,
							o = er.get(k);
						if (w < 0.03) continue;
						if (!o || w > o.e) {
							er.set(k, { e: w, at: now, cx, cy });
							box(cx, cy);
						} else o.at = now;
					}
			}
			for (const [k, o] of er)
				if (now - o.at > HOLD) {
					o.e -= dt / REGROW;
					if (o.e <= 0) er.delete(k);
					box(o.cx, o.cy);
				}
			return { boxes, busy: er.size > 0 };
		};
		return f;
	};

	const PLATES = [
		["strata", strata],
		["voronoi", voronoi],
		["flow", flow],
		["halftone", halftone],
	].filter(([name]) => readable || name !== "flow");

	const B8 = (() => {
		let m = [[0]];
		for (let s = 1; s < 8; s *= 2) {
			const n = m.map((r) => [...r, ...r]).concat(m.map((r) => [...r, ...r]));
			for (let y = 0; y < 2 * s; y++)
				for (let x = 0; x < 2 * s; x++)
					n[y][x] =
						4 * m[y % s][x % s] +
						[
							[0, 2],
							[3, 1],
						][(y / s) | 0][(x / s) | 0];
			m = n;
		}
		return m;
	})();
	const made = new Map();
	let at = 0,
		job = 0,
		shown = null,
		madeAt = "";
	function plate(reveal) {
		const my = ++job,
			box = $("art"),
			cv = box.querySelector("canvas"),
			W = box.clientWidth,
			H = box.clientHeight;
		if (!W || !H) return;
		const dpr = dprNow(),
			cd = Math.max(1, Math.round(U() * dpr)),
			cols = Math.floor((W * dpr) / cd),
			rows = Math.floor((H * dpr) / cd);
		if (madeAt !== `${cols}x${rows}`) {
			made.clear();
			madeAt = `${cols}x${rows}`;
		}
		if (!made.has(at)) {
			const shade = PLATES[at][1](cols / rows, inkNow(), cols, rows),
				out = new Uint8ClampedArray(cols * rows * 4);
			for (let j = 0; j < rows; j++)
				for (let i = 0; i < cols; i++) {
					const s = shade((i + 0.5) / rows, (j + 0.5) / rows);
					if (s[0] > (B8[j & 7][i & 7] + 0.5) / 64) {
						const o = (j * cols + i) * 4,
							c = s[1];
						out[o] = c[0];
						out[o + 1] = c[1];
						out[o + 2] = c[2];
						out[o + 3] = 255;
					}
				}
			made.set(at, { shade, out });
		}
		const g = cv.getContext("2d"),
			{ shade, out } = made.get(at),
			id = new ImageData(out.slice(), cols, rows);
		if (cv.width !== cols || cv.height !== rows) {
			cv.width = cols;
			cv.height = rows;
			shown = null;
		}
		cv.style.width = `${(cols * cd) / dpr}px`;
		cv.style.height = `${(rows * cd) / dpr}px`;
		cur = null;
		if (!reveal || still) {
			g.putImageData(id, 0, 0);
			shown = id;
			cur = { shade, id, cols, rows, g };
			return;
		}
		const from = new Uint32Array(
				(shown || new ImageData(cols, rows)).data.buffer,
			),
			to = new Uint32Array(id.data.buffer),
			mix = new ImageData(cols, rows),
			m = new Uint32Array(mix.data.buffer),
			t0 = performance.now();
		(function step(now) {
			if (my !== job) return;
			const q = Math.min(1, (now - t0) / 480);
			for (let j = 0, o = 0; j < rows; j++) {
				const row = B8[j & 7];
				for (let i = 0; i < cols; i++, o++)
					m[o] = (row[i & 7] + 0.5) / 64 <= q ? to[o] : from[o];
			}
			g.putImageData(mix, 0, 0);
			shown = mix;
			if (q < 1) requestAnimationFrame(step);
			else {
				cur = { shade, id, cols, rows, g };
				kickP();
			}
		})(t0);
	}
	function caption() {
		$("pl").textContent = `pl. ${at + 1}`;
		$("cap").textContent = PLATES[at][0];
		$("frame").setAttribute(
			"aria-label",
			`pl. ${at + 1} ${PLATES[at][0]}, next plate`,
		);
	}

	const P = { x: -9, y: -9, s: 0, in: false, moved: -1e9 };
	let skipNext = false;
	let cur = null,
		praf = 0;
	function pcell(c, i, j) {
		const s = c.shade((i + 0.5) / c.rows, (j + 0.5) / c.rows),
			o = (j * c.cols + i) * 4,
			d = c.id.data;
		if (s[0] > (B8[j & 7][i & 7] + 0.5) / 64) {
			const h = s[1];
			d[o] = h[0];
			d[o + 1] = h[1];
			d[o + 2] = h[2];
			d[o + 3] = 255;
		} else d[o + 3] = 0;
	}
	function pdraw(c, x0, y0, x1, y1) {
		x0 = Math.max(0, x0);
		y0 = Math.max(0, y0);
		x1 = Math.min(c.cols, x1);
		y1 = Math.min(c.rows, y1);
		if (x1 <= x0 || y1 <= y0) return;
		for (let j = y0; j < y1; j++) for (let i = x0; i < x1; i++) pcell(c, i, j);
		c.g.putImageData(c.id, 0, 0, x0, y0, x1 - x0, y1 - y0);
	}
	function pframe() {
		praf = 0;
		const c = cur;
		if (!c) return;
		const tgt = P.in ? 1 : 0;
		P.s += (tgt - P.s) * 0.12;
		if (Math.abs(P.s - tgt) < 0.01) P.s = tgt;
		let busy = P.s !== tgt;
		if (c.shade.tick) {
			const r = c.shade.tick(performance.now());
			for (const [x0, y0, x1, y1] of r.boxes)
				pdraw(
					c,
					Math.floor(x0 * c.rows),
					Math.floor(y0 * c.rows),
					Math.ceil(x1 * c.rows),
					Math.ceil(y1 * c.rows),
				);
			busy = busy || r.busy;
		} else if (c.shade.layers) {
			for (const [a, b] of c.shade.layers()) {
				pdraw(c, 0, Math.floor(a * c.rows), c.cols, Math.ceil(b * c.rows));
				busy = true;
			}
		}
		if (busy) praf = requestAnimationFrame(pframe);
	}
	function kickP() {
		if (!praf && !still) praf = requestAnimationFrame(pframe);
	}
	const plateBox = document.querySelector(".plate");
	plateBox.addEventListener("pointermove", (e) => {
		if (e.pointerType === "touch" || still) return;
		const r = $("art").querySelector("canvas").getBoundingClientRect();
		P.x = (e.clientX - r.left) / r.height;
		P.y = (e.clientY - r.top) / r.height;
		P.in = P.x >= 0 && P.y >= 0 && P.y <= 1 && e.clientX <= r.right;
		if (P.in) P.moved = performance.now();
		kickP();
	});
	plateBox.addEventListener("pointerleave", () => {
		P.in = false;
		kickP();
	});

	const STROKES = [
		[
			[9, 4],
			[9, 12],
			[9, 20],
			[10, 24],
			[13, 26],
			[16, 25],
		],
		[
			[3, 12.5],
			[9, 12],
			[16, 11.5],
		],
		[
			[22, 19.5],
			[27, 19.5],
			[32, 18.5],
			[32, 14.5],
			[28, 11.5],
			[23.5, 13],
			[21, 18],
			[22, 23],
			[26, 26],
			[31, 25.5],
			[34, 23],
		],
		[
			[49, 14.5],
			[46, 11.5],
			[42, 11.5],
			[39, 14],
			[38, 19],
			[40, 24],
			[44, 25.5],
			[48, 23],
			[49, 18],
		],
		[
			[49, 11],
			[49, 20],
			[49, 33],
			[49, 33],
			[52, 30],
		],
	];
	const K = 3,
		PATH = STROKES.map((p) => {
			const o = [],
				pt = (i) => p[Math.max(0, Math.min(p.length - 1, i))];
			for (let i = 0; i < p.length - 1; i++)
				for (let t = 0; t < 1; t += 1 / 36) {
					const a = pt(i - 1),
						b = pt(i),
						c = pt(i + 1),
						d = pt(i + 2),
						t2 = t * t,
						t3 = t2 * t;
					o.push(
						[0, 1].map(
							(k) =>
								K *
								0.5 *
								(2 * b[k] +
									(c[k] - a[k]) * t +
									(2 * a[k] - 5 * b[k] + 4 * c[k] - d[k]) * t2 +
									(3 * b[k] - a[k] - 3 * c[k] + d[k]) * t3),
						),
					);
				}
			return o;
		});
	let wmRaf = 0;
	function wordmark(anim) {
		const h = $("wm"),
			[halo, cv] = h.querySelectorAll("canvas"),
			u = U(),
			fw = $("frame"),
			pad = 4,
			s = Math.max(
				1 / 3,
				Math.min(
					fw.clientWidth < 700 ? 2 / 3 : 1,
					(fw.clientHeight / u - 2 * pad - 16) / (37 * K),
				),
			);
		for (const c of [halo, cv]) {
			c.width = Math.ceil(56 * K * s) + 2 * pad;
			c.height = Math.ceil(37 * K * s) + 2 * pad;
			c.style.width = `${c.width * u}px`;
			c.style.height = `${c.height * u}px`;
		}
		const dpr = dprNow();
		h.style.top = `${Math.round(((fw.clientHeight - halo.height * u) / 2) * dpr) / dpr}px`;
		cancelAnimationFrame(wmRaf);
		const bs = getComputedStyle(document.body),
			g = cv.getContext("2d"),
			gh = halo.getContext("2d");
		g.fillStyle = bs.color;
		gh.fillStyle = bs.backgroundColor;
		const dot = (p) => {
			const x = Math.round(p[0] * s) + pad,
				y = Math.round(p[1] * s) + pad;
			gh.fillRect(x - 3, y - 2, 10, 8);
			gh.fillRect(x - 2, y - 3, 8, 10);
			g.fillRect(x + 1, y, 2, 4);
			g.fillRect(x, y + 1, 4, 2);
		};
		if (!anim || still) {
			for (const st of PATH) st.forEach(dot);
			return;
		}
		let si = 0,
			pi = 0,
			rest = 0;
		(function step() {
			if (rest > 0) rest--;
			else
				for (let n = 0; n < 11 && si < PATH.length; n++) {
					dot(PATH[si][pi++]);
					if (pi >= PATH[si].length) {
						si++;
						pi = 0;
						rest = 7;
						break;
					}
				}
			if (si < PATH.length) wmRaf = requestAnimationFrame(step);
		})();
	}

	$("frame").onclick = () => {
		at = (at + 1) % PLATES.length;
		caption();
		plate(true);
		skipNext = true;
	};
	const pose = (svg, i) => {
		[...svg.children].forEach((g, k) => {
			g.style.display = k === i ? "" : "none";
		});
	};

	const FEED = "https://feed.quilling.dev/feeds.json";
	const ago = (t) => {
		const s = (Date.now() - t) / 1e3;
		for (const [n, u] of [
			[31536e3, "y"],
			[2592e3, "mo"],
			[604800, "w"],
			[86400, "d"],
			[3600, "h"],
			[60, "m"],
		])
			if (s >= n) return Math.floor(s / n) + u;
		return "now";
	};
	function fill(id, rows) {
		$(id)
			.querySelectorAll(".row")
			.forEach((a, k) => {
				const it = rows[k];
				a.querySelector("span").textContent = it?.verb || "";
				a.querySelector("b").textContent = it?.text || "";
				const time = a.querySelector("time");
				time.dateTime = it?.t || "";
				if (it?.href) a.href = it.href;
				else a.removeAttribute("href");
			});
	}
	const ages = () => {
		for (const time of document.querySelectorAll(".feed time")) {
			const t = Date.parse(time.dateTime);
			time.textContent = Number.isNaN(t) ? "" : ago(t);
		}
	};
	const show = (f) => {
		for (const [id, s] of [
			["bsky", f?.bsky],
			["tngl", f?.tangled],
		])
			if (Array.isArray(s?.rows) && s.rows.length) fill(id, s.rows);
		ages();
	};
	async function feeds() {
		let saved = null;
		try {
			saved = JSON.parse(localStorage.getItem("feeds"));
		} catch {}
		let shown = false;
		const reveal = (f) => {
			if (shown) return;
			shown = true;
			show(f);
			for (const s of document.querySelectorAll(".feed"))
				s.classList.add("shown");
		};
		const late = setTimeout(() => reveal(saved), 1500);
		try {
			const r = await fetch(FEED, { signal: AbortSignal.timeout(5000) });
			if (r.ok) {
				const f = await r.json();
				reveal(f);
				localStorage.setItem("feeds", JSON.stringify(f));
			}
		} catch {}
		clearTimeout(late);
		reveal(saved);
	}
	const BARS = {
		hat: ["#f4c6da", hatBadge],
		tranquil: ["#7d8584", tranquilBadge],
		albedo: ["#ddb3ff", albedoBadge],
		shatter: ["#9fd8f7", shatterBadge],
		possums: ["#c9c6cf", possumsBadge],
		nixos: ["#5b6aa8", nixosBadge],
	};
	const toneAt = (v, x, y) => {
		const lo = Math.floor(v);
		return v - lo > (B8[y & 7][x & 7] + 0.5) / 64 ? lo + 1 : lo;
	};
	function letter(g, rows, x0, top, colour, halo) {
		if (halo)
			rows.forEach((r, y) => {
				for (let x = 0; x < r.length; x++)
					if (r[x] === "#")
						for (let dy = -1; dy <= 1; dy++)
							for (let dx = -1; dx <= 1; dx++)
								g.px(x0 + x + dx, top + y + dy, halo);
			});
		rows.forEach((r, y) => {
			for (let x = 0; x < r.length; x++)
				if (r[x] === "#") g.px(x0 + x, top + y, colour);
		});
	}
	function tranquilBadge(g, soften, W, H) {
		const bg = soften("#0f1111", 0.12),
			near = soften("#8a9190", 0.1),
			far = soften("#3a3f3f", 0.1),
			white = soften("#f2f4f4", 0.06);
		const { px } = g;
		g.fillStyle = bg;
		g.fillRect(0, 0, W, H);
		const mid = soften("#5d6463", 0.1),
			band = (x, y) =>
				Math.exp(
					-(
						((y -
							(20.5 +
								3.2 * Math.sin((x / W) * Math.PI * 1.7 + 0.36 - tqPhase))) /
							3.6) **
						2
					),
				);
		const crestc = soften("#c9cecd", 0.1);
		for (let y = 3, r = 0; y < H - 3; y += 3, r++)
			for (let x = 3 + (r % 2) * 2; x < W - 4; x += 4) {
				if (y < 14 && x < 6 + S.tqWord[0].length + 2) continue;
				const m = band(x, y);
				if (m > 0.8) {
					g.fillStyle = crestc;
					g.fillRect(x, y, 2, 2);
				} else if (m > 0.55) {
					g.fillStyle = near;
					g.fillRect(x, y, 2, 2);
				} else if (m > 0.3) px(x, y, near);
				else if (m > 0.12) px(x, y, mid);
				else {
					const fade = (x / W) * 0.7 + (y / H) * 0.3;
					if (
						fade <
						0.15 + (0.7 * (B8[((y / 3) | 0) & 7][((x / 3) | 0) & 7] + 0.5)) / 64
					)
						px(x, y, far);
				}
			}
		letter(g, S.tqWord, 6, 4, white);
	}
	const SELF_AT = [2, 0];
	const HAT_C = [70, 15],
		HAT_SHARDS = (() => {
			const R = rng(41),
				s = [];
			for (let k = 0; k < 18; k++) {
				const a = R() * TAU,
					q = 3 + R() ** 0.8 * 72;
				s.push([
					HAT_C[0] + Math.cos(a) * q,
					HAT_C[1] + Math.sin(a) * q * 0.6,
					R(),
					q,
				]);
			}
			return s;
		})();
	let hatRing = 0;
	function hatBadge(g, soften, W, H) {
		const pink = "#e7a7c3",
			tones = [soften(paperHex(), 0), soften(pink, 0.55), soften(pink, 0.12)];
		const { px } = g,
			ring = hatRing * 9;
		for (let y = 0; y < H; y++)
			for (let x = 0; x < W; x++) {
				let d1 = 1e9,
					d2 = 1e9,
					s0;
				for (const s of HAT_SHARDS) {
					const e = Math.hypot(x + 0.5 - s[0], y + 0.5 - s[1]);
					if (e < d1) {
						d2 = d1;
						d1 = e;
						s0 = s;
					} else if (e < d2) d2 = e;
				}
				if (d2 - d1 < 1) {
					px(x, y, tones[0]);
					continue;
				}
				const d = Math.hypot(x + 0.5 - HAT_C[0], (y + 0.5 - HAT_C[1]) / 0.6),
					lift = hatRing && s0[3] <= ring && s0[3] > ring - 20 ? 1 : 0,
					v = Math.max(
						0,
						Math.min(
							2,
							0.45 +
								1.6 * Math.max(0, 1 - d / 95) ** 1.1 * (0.3 + 0.95 * s0[2]) +
								lift,
						),
					);
				px(x, y, tones[Math.min(2, toneAt(v, x, y))]);
			}
		S.hat.forEach((r, y) => {
			for (let x = 0; x < r.length; x++)
				if (r[x] !== ".")
					px(SELF_AT[0] + x, SELF_AT[1] + y, soften(S.hatPal[r[x]], 0.06));
		});
		const plum = soften("#6b2d4f", 0.12);
		letter(g, S.hatTeq, 4, 9, plum, tones[0]);
		letter(g, S.hatHandle, 3, 19, plum, tones[0]);
	}
	const PN_TINT = "#c4a24e";
	function possumsBadge(g, soften, W, H) {
		const grey = PN_TINT,
			tones = [soften(paperHex(), 0), soften(grey, 0.6), soften(grey, 0.3)],
			paper = tones[0],
			ink = soften("#1c1c1a", 0.05),
			red = soften("#c1121c", 0.05),
			{ px } = g;
		for (let y = 0; y < H; y++)
			for (let x = 0; x < W; x++) {
				const t =
					0.2 +
					1.7 * ((x / W) * 0.8 + (y / H) * 0.2) -
					((x + y) % 4 === 0 ? 0.3 : 0);
				px(x, y, tones[Math.min(2, toneAt(Math.max(0, Math.min(2, t)), x, y))]);
			}
		const frame = soften(grey, 0.05);
		for (let y = 3; y < 28; y++) for (let x = 2; x < 28; x++) px(x, y, frame);
		S.pnPhoto.forEach((r, y) => {
			for (let x = 0; x < r.length; x++)
				px(3 + x, 4 + y, soften(S.pnPal[r[x]], 0.04));
		});
		letter(g, S.pnCaps, 30, 6, ink, paper);
		letter(g, S.pnNow, 40, 15 - 2 * pnHop, red, paper);
	}
	let nxFrame = 0;
	function nixosBadge(g, soften, W, H) {
		const { px } = g,
			bg = [soften("#1a2140", 0.08), soften("#26315c", 0.08)];
		for (let y = 0; y < H; y++)
			for (let x = 0; x < W; x++) {
				const v = (x / W) * 0.7 + (y / H) * 0.3;
				px(x, y, bg[v > ((B8[y & 7][x & 7] + 0.5) / 64) * 0.8 + 0.1 ? 1 : 0]);
			}
		const col = { d: soften("#5b82cf", 0.04), l: soften("#86c3ee", 0.04) };
		S.nxFrames[nxFrame].forEach((r, y) => {
			for (let x = 0; x < r.length; x++)
				if (r[x] !== ".") px(x - 1, y - 1, col[r[x]]);
		});
		letter(g, S.nxCaps, 79 - S.nxCaps[0].length, 6, soften("#9cc4ee", 0.1));
		g.font = '11px "Departure Mono"';
		g.textAlign = "center";
		g.fillStyle = bg[0];
		for (const [dx, dy] of [
			[-1, 0],
			[1, 0],
			[0, -1],
			[0, 1],
			[-1, -1],
			[1, 1],
			[-1, 1],
			[1, -1],
		])
			g.fillText("NixOS", 59 + dx, 24 + dy);
		g.fillStyle = soften(paperHex(), 0);
		g.fillText("NixOS", 59, 24);
		g.textAlign = "start";
	}
	let ssFrame = 0;
	function shatterBadge(g, soften, W, H) {
		const paper = soften(paperHex(), 0),
			tones = [paper, soften("#00b9fd", 0.78), soften("#0082fd", 0.55)],
			navy = soften("#0b2f73", 0.12);
		const { px } = g;
		for (let y = 0; y < H; y++)
			for (let x = 0; x < W; x++) {
				const t =
					-0.1 +
					1.8 * ((x / W) * 0.8 + (y / H) * 0.2) -
					((x + y) % 4 === 0 ? 0.3 : 0);
				px(x, y, tones[Math.min(2, toneAt(Math.max(0, Math.min(2, t)), x, y))]);
			}
		const lx = 2,
			ly = 1;
		S.ssFrames[ssFrame].forEach((r, y) => {
			for (let x = 0; x < 16; x++)
				if (r[x] !== ".") {
					g.fillStyle = soften(S.ssPal[r[x]], 0.1);
					g.fillRect(lx + 2 * x, ly + 2 * y, 2, 2);
				}
		});
		letter(g, S.ssWord, 84 - S.ssWord[0].length, 19, navy, paper);
	}
	let paperHexV = "";
	const paperHex = () =>
		(paperHexV ||= getComputedStyle(document.documentElement)
			.getPropertyValue("--day")
			.trim());
	let albedoTwinkle = 0,
		tqPhase = 0,
		albPhase = 0;
	function albedoBadge(g, soften, W, H) {
		const tones = [
			soften(paperHex(), 0),
			soften("#ddb3ff", 0.6),
			soften("#3a1f52", 0.42),
		];
		for (let y = 0; y < H; y++)
			for (let x = 0; x < W; x++) {
				let t = 2.15 + 1.9 * ((x / W) * 0.8 + (y / H) * 0.2);
				const ex = (x - W * 0.4) / (W * 0.8),
					ey = (y + H * 0.42) / (H * 0.95);
				if (ex * ex + ey * ey < 1) t -= 0.55;
				if ((x + y) % 4 === 0) t -= 0.35;
				g.px(
					x,
					y,
					tones[Math.min(2, toneAt(Math.max(0, Math.min(2, t)), x, y))],
				);
			}
		planet(g, soften);
		letter(
			g,
			S.albedoWord,
			W - 5 - S.albedoWord[0].length,
			10,
			soften("#f3e8f7", 0.1),
		);
	}
	function planet(g, soften) {
		const cx = 15,
			cy = 17,
			R = 10.5,
			Lx = -0.55,
			Ly = -0.62,
			Lz = 0.56,
			tone = ["#3a2a44", "#7a5a92", "#c9a2ec", "#f3e8f7"].map((c) =>
				soften(c, 0.15),
			),
			maria = (() => {
				const tc = Math.cos(0.28),
					ts = Math.sin(0.28),
					out = [];
				for (const [mx, my, mr] of [
					[0.25, 0.15, 0.32],
					[-0.15, 0.45, 0.22],
					[0.5, -0.3, 0.18],
				]) {
					const ax = mx * tc - my * ts,
						ay = mx * ts + my * tc,
						az = Math.sqrt(1 - ax * ax - ay * ay);
					for (const a of [0, TAU / 3, (2 * TAU) / 3])
						out.push([
							ax * Math.cos(a) + az * Math.sin(a),
							ay,
							-ax * Math.sin(a) + az * Math.cos(a),
							mr,
						]);
				}
				return out;
			})(),
			tc = Math.cos(0.28),
			ts = Math.sin(0.28),
			pc = Math.cos(albPhase * TAU),
			ps = Math.sin(albPhase * TAU);
		const dot = g.px;
		const ring = (front) => {
			for (let i = 0; i < 120; i += 1) {
				const a = (i / 120) * 2 * Math.PI,
					ex = 16 * Math.cos(a),
					ey = 3.6 * Math.sin(a),
					r = -0.28,
					x = Math.round(cx + ex * Math.cos(r) - ey * Math.sin(r)),
					y = Math.round(cy + ex * Math.sin(r) + ey * Math.cos(r));
				if (Math.sin(a) > 0 !== front) continue;
				if (!front && (x - cx) ** 2 + (y - cy) ** 2 < R * R) continue;
				if (x >= 1 && x < 87 && y >= 2 && y < 29) dot(x, y, tone[2]);
			}
		};
		ring(false);
		for (let y = Math.floor(cy - R); y <= cy + R; y++)
			for (let x = Math.floor(cx - R); x <= cx + R; x++) {
				const dx = (x + 0.5 - cx) / R,
					dy = (y + 0.5 - cy) / R,
					d2 = dx * dx + dy * dy;
				if (d2 > 1) continue;
				const dz = Math.sqrt(1 - d2);
				let l = Math.max(0, dx * Lx + dy * Ly + dz * Lz);
				const ax = dx * tc - dy * ts,
					ay = dx * ts + dy * tc,
					sx = ax * pc - dz * ps,
					sz = ax * ps + dz * pc;
				for (const [mx, my, mz, mr] of maria)
					if ((sx - mx) ** 2 + (ay - my) ** 2 + (sz - mz) ** 2 < mr * mr) {
						l *= 0.55;
						break;
					}
				dot(x, y, tone[Math.min(3, toneAt(Math.min(2.999, l * 3.4), x, y))]);
			}
		ring(true);
		const arm = 2 + albedoTwinkle;
		dot(31, 5, tone[3]);
		for (let i = 1; i <= arm; i++)
			for (const [x, y] of [
				[31, 5 - i],
				[31, 5 + i],
				[31 - i, 5],
				[31 + i, 5],
			])
				if (y >= 2) dot(x, y, tone[i <= 2 ? 3 : 2]);
		if (albedoTwinkle)
			for (const [x, y] of [
				[30, 4],
				[32, 4],
				[30, 6],
				[32, 6],
			])
				dot(x, y, tone[albedoTwinkle > 1 ? 3 : 2]);
		for (const [x, y] of [
			[34, 26],
			[27, 27],
			[5, 4],
		])
			dot(x, y, tone[3]);
	}
	const RGBA = new Map(),
		rgba = (s) => {
			let v = RGBA.get(s);
			if (v === undefined) {
				const [r, g, b] =
					s[0] === "#"
						? [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16))
						: s.match(/[\d.]+/g).map(Number);
				v = ((255 << 24) | (b << 16) | (g << 8) | r) >>> 0;
				RGBA.set(s, v);
			}
			return v;
		};
	function surface(W, H) {
		const img = new ImageData(W, H),
			px = new Uint32Array(img.data.buffer),
			rect = (x, y, w, h, v) => {
				const x0 = Math.max(0, Math.floor(x)),
					x1 = Math.min(W, Math.floor(x + w));
				for (
					let j = Math.max(0, Math.floor(y));
					j < Math.min(H, Math.floor(y + h));
					j++
				)
					px.fill(v, j * W + x0, j * W + x1);
			};
		let c = 0,
			style = "";
		return {
			img,
			text: [],
			set fillStyle(s) {
				c = rgba(s);
				style = s;
			},
			set font(f) {
				this.text.push((g) => {
					g.font = f;
				});
			},
			set textAlign(a) {
				this.text.push((g) => {
					g.textAlign = a;
				});
			},
			fillText(t, x, y) {
				const s = style;
				this.text.push((g) => {
					g.fillStyle = s;
					g.fillText(t, x, y);
				});
			},
			fillRect: (x, y, w, h) => rect(x, y, w, h, c),
			clearRect: (x, y, w, h) => rect(x, y, w, h, 0),
			px: (x, y, s) => rect(x, y, 1, 1, rgba(s)),
		};
	}
	const SOFT = new Map(),
		soften = (h, f) => {
			const key = h + f;
			let s = SOFT.get(key);
			if (!s) {
				const hex = (c, i) => parseInt(c.slice(i, i + 2), 16);
				s = `rgb(${[1, 3, 5].map((i) => Math.round(hex(h, i) * (1 - f) + hex(paperHex(), i) * f)).join(" ")})`;
				SOFT.set(key, s);
			}
			return s;
		};
	const badgeArt = document.createElement("canvas");
	badgeArt.width = 88;
	badgeArt.height = 31;
	function userbar(a) {
		if (!spritesIn) return;
		const [rim, paint] = BARS[a.dataset.bar],
			cv = a.querySelector("canvas"),
			W = 88,
			H = 31,
			k = Math.max(1, Math.round(2 * dprNow())),
			g = surface(W, H);
		paint(g, soften, W, H);
		g.fillStyle = soften(rim, 0.3);
		S.edge.forEach((r, y) => {
			for (let x = 0; x < W; x++) {
				if (r[x] === "x") g.clearRect(x, y, 1, 1);
				else if (r[x] === "r") g.fillRect(x, y, 1, 1);
			}
		});
		badgeArt.getContext("2d").putImageData(g.img, 0, 0);
		if (cv.width !== W * k) {
			cv.width = W * k;
			cv.height = H * k;
		}
		const c = cv.getContext("2d");
		c.setTransform(1, 0, 0, 1, 0, 0);
		c.imageSmoothingEnabled = false;
		c.globalCompositeOperation = "copy";
		c.drawImage(badgeArt, 0, 0, W * k, H * k);
		c.globalCompositeOperation = "source-over";
		c.setTransform(k, 0, 0, k, 0, 0);
		c.font = '11px "Departure Mono"';
		c.textAlign = "start";
		for (const op of g.text) op(c);
	}
	function userbars() {
		document.querySelectorAll(".ubar[data-bar]").forEach(userbar);
	}
	const BEATS = [
			800, 150, 150, 150, 50, 100, 150, 150, 150, 150, 6000, 150, 150, 150, 150,
			100, 50, 100, 150, 150,
		],
		CYCLE = BEATS.reduce((a, b) => a + b, 0),
		ENDS = BEATS.map((_, i, a) => a.slice(0, i + 1).reduce((x, y) => x + y, 0)),
		beatAt = (l) => ENDS.findIndex((e) => l < e);
	let T0 = performance.now(),
		lastCycle = 0,
		lastBeat = -1;
	const poseAt = (table, l) => {
		const s = table.find(([a, , d]) => l >= a && l < a + d);
		return s ? s[1] : 0;
	};
	const flapAt = (c) => [
			[c - 210, 1, 110],
			[c - 100, 2, 200],
			[c + 100, 1, 170],
		],
		FLAP = [...flapAt(1475), ...flapAt(8525)],
		fly = document.querySelector("[data-ic=fly]");
	let lastFlap = 0;
	const SKYBEAT = [
			[0, 1, 180],
			[180, 2, 160],
			[340, 1, 240],
		],
		skyIc = document.querySelector("[data-ic=sky]");
	let lastSky = 0;
	const shakeAt = (c) => [
			[c, 1, 60],
			[c + 60, 2, 130],
			[c + 190, 1, 60],
			[c + 250, 3, 60],
			[c + 310, 4, 130],
			[c + 440, 3, 60],
			[c + 500, 1, 80],
			[c + 580, 3, 80],
		],
		SHAKE = shakeAt(1475 - 120),
		dolly = document.querySelector("[data-ic=dolly]");
	let lastDolly = 0;
	const GLOBE = 24,
		GLOBE_GO = 800,
		SPIN = 2000,
		spinAt = (l) =>
			l > 0 && l < SPIN ? Math.round(ease(l / SPIN) * GLOBE) : 0,
		globe = document.querySelector("[data-ic=globe]"),
		spinTo = (f) =>
			globe.firstElementChild.setAttribute(
				"x",
				-882 - 16 * (((f % GLOBE) + GLOBE) % GLOBE),
			);
	let lastGlobe = 0;
	const FLUTTER = {
			fly: [
				[0, 1, 70],
				[70, 2, 90],
				[160, 1, 70],
				[230, 2, 90],
				[320, 1, 90],
			],
			sky: [
				[0, 1, 110],
				[110, 2, 110],
				[220, 1, 110],
				[330, 2, 110],
				[440, 1, 160],
			],
		},
		lasts = (seq) => seq.at(-1)[0] + seq.at(-1)[2],
		PRESS = new Map([
			[
				fly,
				[
					"flutter",
					lasts(FLUTTER.fly),
					(l) => pose(fly, poseAt(FLUTTER.fly, l)),
				],
			],
			[
				skyIc,
				[
					"flutter",
					lasts(FLUTTER.sky),
					(l) => {
						const p = poseAt(FLUTTER.sky, l);
						pose(skyIc, p);
						skyIc.classList.toggle("lift", p === 2);
					},
				],
			],
			[
				dolly,
				["shake", lasts(shakeAt(0)), (l) => pose(dolly, poseAt(shakeAt(0), l))],
			],
			[globe, ["spin", SPIN, (l) => spinTo(spinAt(l))]],
		]),
		pressed = new Set();
	for (const [svg, [label, end, show]] of PRESS) {
		const key = document.createElement("button");
		key.type = "button";
		key.className = "flit";
		key.setAttribute("aria-label", label);
		svg.replaceWith(key);
		key.append(svg);
		key.onclick = () => {
			const t0 = performance.now(),
				step = () => {
					const l = Math.min(performance.now() - t0, end);
					show(l);
					if (l < end) return requestAnimationFrame(step);
					pressed.delete(svg);
					lastFlap = lastSky = lastDolly = lastGlobe = -1;
				};
			if (pressed.has(svg)) return;
			pressed.add(svg);
			requestAnimationFrame(step);
		};
	}
	const TWINKLE = [
			[4350, 1, 150],
			[4500, 2, 150],
			[4650, 1, 150],
		],
		albedoEl = document.querySelector("[data-bar=albedo]");
	const SSGLINT = [
			[0, 1, 100],
			[100, 2, 100],
			[200, 3, 160],
			[360, 4, 100],
			[460, 5, 100],
		],
		ssEl = document.querySelector("[data-bar=shatter]");
	const TQ_STEPS = 48,
		TQ_GO = 8000,
		TQ_RUN = CYCLE - 8000 + 2000,
		tqEl = document.querySelector("[data-bar=tranquil]"),
		ease = (u) => u * u * u * (u * (6 * u - 15) + 10),
		tqTurns = (t) => {
			const k = Math.floor((t - TQ_GO) / CYCLE),
				u = (t - TQ_GO - k * CYCLE) / TQ_RUN;
			return ((((k + (u < 1 ? ease(u) : 1)) / 2) % 1) + 1) % 1;
		};
	let lastTq = -1;
	const NX_GO = [1400, 8450],
		NX_RUN = 1500,
		nxElastic = (u) =>
			2 ** (-10 * u) * Math.sin(((u * 10 - 0.75) * 2 * Math.PI) / 3) + 1,
		nxAt = (l) => {
			const n = S.nxFrames.length;
			for (const s of NX_GO) {
				const u = ((((l - s) % CYCLE) + CYCLE) % CYCLE) / NX_RUN;
				if (u > 0 && u < 1) return ((Math.round(nxElastic(u) * n) % n) + n) % n;
			}
			return 0;
		},
		nxEl = document.querySelector("[data-bar=nixos]");
	const ALB_GO = 800,
		ALB_RUN = 1200,
		albTurns = (t) => {
			const k = Math.floor((t - ALB_GO) / CYCLE),
				u = (t - ALB_GO - k * CYCLE) / ALB_RUN;
			return ((((k + (u < 1 ? ease(u) : 1)) * 0.25) % 1) + 1) % 1;
		};
	const HAT_GO = 7100,
		HAT_STEP = 90,
		hatAt = (l) =>
			l >= HAT_GO && l < HAT_GO + 10 * HAT_STEP
				? Math.floor((l - HAT_GO) / HAT_STEP) + 1
				: 0,
		hatEl = document.querySelector("[data-bar=hat]");
	const HOP = [6, 14],
		pnEl = document.querySelector("[data-bar=possums]");
	let pnHop = 0;
	const safe = (f) => {
		try {
			f();
		} catch (err) {
			console.error(err);
		}
	};
	const span = (a, ms) =>
			a + ms > CYCLE
				? [
						[a, CYCLE],
						[0, a + ms - CYCLE],
					]
				: [[a, a + ms]],
		MOVING = [
			...[FLAP, SKYBEAT, TWINKLE, SSGLINT, SHAKE]
				.flat()
				.flatMap(([a, , ms]) => span(a, ms)),
			...span(TQ_GO, TQ_RUN),
			...NX_GO.flatMap((a) => span(a, NX_RUN)),
			...span(ALB_GO, ALB_RUN),
			...span(GLOBE_GO, SPIN),
			...span(HAT_GO, 10 * HAT_STEP),
			...HOP.flatMap((b) => span(ENDS[b - 1], BEATS[b])),
		],
		quietFor = (l) =>
			MOVING.some(([a, b]) => l >= a && l < b)
				? 0
				: Math.min(CYCLE, ...MOVING.map(([a]) => a).filter((a) => a > l)) - l;
	function tick(now) {
		if (!onScreen.size) {
			running = false;
			return;
		}
		const t = now - T0,
			cycle = Math.floor(t / CYCLE),
			l = t - cycle * CYCLE,
			quiet = quietFor(l);
		if (paused && quiet > 50) running = false;
		else if (quiet > 50)
			setTimeout(() => requestAnimationFrame(tick), quiet - 20);
		else requestAnimationFrame(tick);
		if (cycle !== lastCycle) {
			lastCycle = cycle;
			const held = skipNext || (P.in && performance.now() - P.moved < 4000);
			skipNext = false;
			if (!paused && !document.hidden && !held && onScreen.has(plateBox))
				safe(() => {
					at = (at + 1) % PLATES.length;
					caption();
					plate(true);
					wordmark(true);
				});
		}
		safe(() => {
			const fl = poseAt(FLAP, l);
			if (fl !== lastFlap && !pressed.has(fly)) {
				lastFlap = fl;
				pose(fly, fl);
			}
		});
		safe(() => {
			const sp = poseAt(SKYBEAT, l);
			if (sp !== lastSky && !pressed.has(skyIc)) {
				lastSky = sp;
				pose(skyIc, sp);
				skyIc.classList.toggle("lift", sp === 2);
			}
		});
		safe(() => {
			const sh = poseAt(SHAKE, l);
			if (sh !== lastDolly && !pressed.has(dolly)) {
				lastDolly = sh;
				pose(dolly, sh);
			}
		});
		safe(() => {
			const gf = spinAt(l - GLOBE_GO);
			if (gf !== lastGlobe && !pressed.has(globe)) {
				lastGlobe = gf;
				spinTo(gf);
			}
		});
		if (!spritesIn || !onScreen.has(badgeBox)) return;
		safe(() => {
			const tq = Math.round(tqTurns(t) * TQ_STEPS) % TQ_STEPS;
			if (tq !== lastTq) {
				lastTq = tq;
				tqPhase = (tq / TQ_STEPS) * 2 * Math.PI;
				userbar(tqEl);
			}
		});
		safe(() => {
			const sf = poseAt(SSGLINT, l);
			if (sf !== ssFrame) {
				ssFrame = sf;
				userbar(ssEl);
			}
		});
		safe(() => {
			const nf = nxAt(l);
			if (nf !== nxFrame) {
				nxFrame = nf;
				userbar(nxEl);
			}
		});
		safe(() => {
			const hr = hatAt(l);
			if (hr !== hatRing) {
				hatRing = hr;
				userbar(hatEl);
			}
		});
		safe(() => {
			const ap = Math.round(albTurns(t) * 96) / 96,
				tw = poseAt(TWINKLE, l);
			if (ap !== albPhase || tw !== albedoTwinkle) {
				albPhase = ap;
				albedoTwinkle = tw;
				userbar(albedoEl);
			}
		});
		safe(() => {
			const b = beatAt(l);
			if (b !== lastBeat) {
				lastBeat = b;
				const hop = HOP.includes(b) ? 1 : 0;
				if (hop !== pnHop) {
					pnHop = hop;
					userbar(pnEl);
				}
			}
		});
	}
	const onScreen = new Set(),
		badgeBox = document.querySelector(".badges");
	let running = false;
	let paused = still;
	const motion = $("motion"),
		setPaused = (p) => {
			paused = p;
			motion.setAttribute("aria-pressed", p);
			motion.title = p ? "play" : "pause";
			wake();
		};
	motion.removeAttribute("popovertarget");
	motion.onclick = () => setPaused(!paused);
	const dark = $("dark"),
		themeColor = document.querySelectorAll('meta[name="theme-color"]'),
		nightShown = () => {
			const n = document.documentElement.classList.contains("night");
			dark.setAttribute("aria-pressed", n);
			dark.title = n ? "day" : "night";
			for (const m of themeColor)
				m.content = getComputedStyle(document.body).backgroundColor;
		},
		setNight = (n) => {
			document.documentElement.classList.toggle("night", n);
			nightShown();
			made.clear();
			plate(false);
			wordmark(false);
		},
		dusk = matchMedia("(prefers-color-scheme: dark)");
	dark.onclick = () => {
		const n = !document.documentElement.classList.contains("night");
		try {
			localStorage.night = n ? 1 : 0;
		} catch {}
		setNight(n);
	};
	dusk.onchange = () => {
		let s;
		try {
			s = localStorage.night;
		} catch {}
		if (!s && !/^#(night|day)$/.test(location.hash)) setNight(dusk.matches);
	};
	nightShown();
	const copy = document.querySelector(".copy");
	if (navigator.clipboard) {
		copy.hidden = false;
		copy.onclick = async () => {
			try {
				await navigator.clipboard.writeText(
					document
						.querySelector(".pub")
						.textContent.trim()
						.split(/\s+/)
						.join(" "),
				);
				copy.textContent = "copied";
				setTimeout(() => {
					copy.textContent = "copy";
				}, 2000);
			} catch {}
		};
	}
	if (!("command" in HTMLButtonElement.prototype))
		for (const b of document.querySelectorAll("[commandfor]"))
			b.addEventListener("click", () => {
				const d = $(b.getAttribute("commandfor"));
				b.getAttribute("command") === "close" ? d.close() : d.showModal();
			});
	const wake = () => {
		if (paused || running || !onScreen.size) return;
		running = true;
		lastCycle = Math.floor((performance.now() - T0) / CYCLE);
		requestAnimationFrame(tick);
	};
	const seen = new IntersectionObserver((es) => {
		for (const e of es)
			e.isIntersecting ? onScreen.add(e.target) : onScreen.delete(e.target);
		wake();
	});
	seen.observe(plateBox);
	seen.observe(badgeBox);
	document.addEventListener("visibilitychange", () => {
		lastCycle = Math.floor((performance.now() - T0) / CYCLE);
	});
	const redraw = () => {
		plate(false);
		wordmark(false);
		userbars();
	};
	let rt;
	const redrawSoon = () => {
		clearTimeout(rt);
		rt = setTimeout(redraw, 80);
	};
	new ResizeObserver(redrawSoon).observe($("art"));
	let lastDpr = devicePixelRatio;
	addEventListener("resize", () => {
		if (devicePixelRatio !== lastDpr) {
			lastDpr = devicePixelRatio;
			redrawSoon();
		}
	});
	setPaused(still);
	caption();
	plate(false);
	wordmark(false);
	$("wm").classList.add("drawn");
	feeds();
	if (readable)
		sprites().then(() => {
			spritesIn = true;
			userbars();
		});
}
