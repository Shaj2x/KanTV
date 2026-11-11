package com.gathin.tvhome;

import java.math.BigInteger;
import java.nio.charset.StandardCharsets;
import java.security.AlgorithmParameters;
import java.security.GeneralSecurityException;
import java.security.KeyFactory;
import java.security.Signature;
import java.security.interfaces.ECPublicKey;
import java.security.spec.ECGenParameterSpec;
import java.security.spec.ECParameterSpec;
import java.security.spec.ECPoint;
import java.security.spec.ECPublicKeySpec;
import java.util.Base64;
import java.util.HashMap;
import java.util.Map;

/**
 * KanTV's subscription pass: a JWS (ES256, ECDSA P-256 with SHA-256) the KanTV backend signs, saying until when
 * this launcher install may show a custom design. Checked offline with java.security alone, which every TV from
 * Android 8.0 has. Pure Java so the JVM unit tests check it against passes signed by the backend's own code.
 */
final class Lease {
    static final String ISSUER = "kantv";
    static final String TYPE = "kantv-lease";

    /** What a valid pass says. */
    static final class Claims {
        final String account;
        final String tv;
        final String instance;
        final long expiresAt;

        Claims(String account, String tv, String instance, long expiresAt) {
            this.account = account;
            this.tv = tv;
            this.instance = instance;
            this.expiresAt = expiresAt;
        }
    }

    private Lease() {}

    /** The P-256 public key from a JWK's x and y (base64url). */
    static ECPublicKey publicKey(String x, String y) throws GeneralSecurityException {
        AlgorithmParameters params = AlgorithmParameters.getInstance("EC");
        params.init(new ECGenParameterSpec("secp256r1"));
        ECParameterSpec spec = params.getParameterSpec(ECParameterSpec.class);
        ECPoint point = new ECPoint(new BigInteger(1, b64(x)), new BigInteger(1, b64(y)));
        return (ECPublicKey) KeyFactory.getInstance("EC").generatePublic(new ECPublicKeySpec(point, spec));
    }

    /**
     * The claims if the pass is signed by the key, is a KanTV pass, has not expired at nowSeconds, and is for this
     * launcher install; null otherwise. Never throws: a bad pass is simply no pass.
     */
    static Claims verify(String jws, ECPublicKey key, String instance, long nowSeconds) {
        if (jws == null || key == null || instance == null) return null;
        String[] parts = jws.trim().split("\\.", -1);
        if (parts.length != 3) return null;
        try {
            Map<String, Object> header = FlatJson.parse(new String(b64(parts[0]), StandardCharsets.UTF_8));
            if (!"ES256".equals(header.get("alg")) || !TYPE.equals(header.get("typ"))) return null;
            byte[] raw = b64(parts[2]);
            if (raw.length != 64) return null;
            Signature verifier = Signature.getInstance("SHA256withECDSA");
            verifier.initVerify(key);
            verifier.update((parts[0] + "." + parts[1]).getBytes(StandardCharsets.US_ASCII));
            if (!verifier.verify(der(raw))) return null;
            Map<String, Object> claims = FlatJson.parse(new String(b64(parts[1]), StandardCharsets.UTF_8));
            Object exp = claims.get("exp");
            if (!ISSUER.equals(claims.get("iss")) || !"full".equals(claims.get("ent"))) return null;
            if (!(exp instanceof Number) || ((Number) exp).longValue() <= nowSeconds) return null;
            if (!instance.equals(claims.get("inst"))) return null;
            return new Claims(String.valueOf(claims.get("sub")), String.valueOf(claims.get("tv")), instance,
                    ((Number) exp).longValue());
        } catch (GeneralSecurityException | IllegalArgumentException e) {
            return null;
        }
    }

    private static byte[] b64(String s) {
        return Base64.getUrlDecoder().decode(s);
    }

    /** JWS carries r||s; java.security wants the DER SEQUENCE { INTEGER r, INTEGER s }. */
    static byte[] der(byte[] raw) {
        byte[] r = integer(raw, 0);
        byte[] s = integer(raw, 32);
        byte[] out = new byte[2 + r.length + s.length];
        out[0] = 0x30;
        out[1] = (byte) (r.length + s.length);
        System.arraycopy(r, 0, out, 2, r.length);
        System.arraycopy(s, 0, out, 2 + r.length, s.length);
        return out;
    }

    private static byte[] integer(byte[] raw, int from) {
        int start = from;
        while (start < from + 31 && raw[start] == 0) start++;
        boolean pad = (raw[start] & 0x80) != 0;
        int len = from + 32 - start + (pad ? 1 : 0);
        byte[] out = new byte[2 + len];
        out[0] = 0x02;
        out[1] = (byte) len;
        System.arraycopy(raw, start, out, 2 + (pad ? 1 : 0), from + 32 - start);
        return out;
    }

    /**
     * Just enough JSON for a pass: one flat object of strings, numbers, booleans and nulls. org.json is part of
     * Android and so not available to JVM unit tests; a pass needs nothing more than this.
     */
    static final class FlatJson {
        private final String s;
        private int i;

        private FlatJson(String s) {
            this.s = s;
        }

        static Map<String, Object> parse(String text) {
            FlatJson p = new FlatJson(text);
            Map<String, Object> out = p.object();
            p.space();
            if (p.i != p.s.length()) throw new IllegalArgumentException("trailing text");
            return out;
        }

        private Map<String, Object> object() {
            Map<String, Object> out = new HashMap<>();
            space();
            expect('{');
            space();
            if (peek() == '}') {
                i++;
                return out;
            }
            while (true) {
                space();
                String key = string();
                space();
                expect(':');
                space();
                out.put(key, value());
                space();
                char c = next();
                if (c == '}') return out;
                if (c != ',') throw new IllegalArgumentException("expected , or }");
            }
        }

        private Object value() {
            char c = peek();
            if (c == '"') return string();
            if (s.startsWith("true", i)) {
                i += 4;
                return Boolean.TRUE;
            }
            if (s.startsWith("false", i)) {
                i += 5;
                return Boolean.FALSE;
            }
            if (s.startsWith("null", i)) {
                i += 4;
                return null;
            }
            int start = i;
            while (i < s.length() && "+-0123456789.eE".indexOf(s.charAt(i)) >= 0) i++;
            if (start == i) throw new IllegalArgumentException("unsupported value");
            String num = s.substring(start, i);
            return num.matches("-?\\d+") ? (Number) Long.parseLong(num) : (Number) Double.parseDouble(num);
        }

        private String string() {
            expect('"');
            StringBuilder b = new StringBuilder();
            while (true) {
                char c = next();
                if (c == '"') return b.toString();
                if (c != '\\') {
                    b.append(c);
                    continue;
                }
                char e = next();
                switch (e) {
                    case '"': case '\\': case '/': b.append(e); break;
                    case 'b': b.append('\b'); break;
                    case 'f': b.append('\f'); break;
                    case 'n': b.append('\n'); break;
                    case 'r': b.append('\r'); break;
                    case 't': b.append('\t'); break;
                    case 'u':
                        if (i + 4 > s.length()) throw new IllegalArgumentException("bad escape");
                        b.append((char) Integer.parseInt(s.substring(i, i + 4), 16));
                        i += 4;
                        break;
                    default: throw new IllegalArgumentException("bad escape");
                }
            }
        }

        private void space() {
            while (i < s.length() && Character.isWhitespace(s.charAt(i))) i++;
        }

        private char peek() {
            if (i >= s.length()) throw new IllegalArgumentException("unexpected end");
            return s.charAt(i);
        }

        private char next() {
            char c = peek();
            i++;
            return c;
        }

        private void expect(char c) {
            if (next() != c) throw new IllegalArgumentException("expected " + c);
        }
    }
}
