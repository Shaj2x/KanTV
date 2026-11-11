package com.gathin.tvhome;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.security.interfaces.ECPublicKey;
import java.util.Map;

import org.junit.BeforeClass;
import org.junit.Test;

/**
 * The subscription pass, checked against passes signed by the backend's own library (scripts/lease-vectors.ts
 * writes src/test/resources/lease-vectors.json): what the backend issues, the launcher accepts, and nothing else.
 */
public class LeaseTest {
    private static String json;
    private static ECPublicKey key;
    private static long now;

    @BeforeClass
    public static void load() throws Exception {
        try (InputStream in = LeaseTest.class.getClassLoader().getResourceAsStream("lease-vectors.json")) {
            json = new String(in.readAllBytes(), StandardCharsets.UTF_8);
        }
        key = Lease.publicKey(field("x"), field("y"));
        now = Long.parseLong(json.replaceAll("(?s).*\"now\":\\s*(\\d+).*", "$1"));
    }

    /** A string field anywhere in the vectors file, by name. */
    private static String field(String name) {
        java.util.regex.Matcher m = java.util.regex.Pattern.compile("\"" + name + "\":\\s*\"([^\"]*)\"").matcher(json);
        assertTrue("no " + name + " in the vectors", m.find());
        return m.group(1);
    }

    @Test
    public void acceptsThePassTheBackendIssued() {
        Lease.Claims c = Lease.verify(field("valid"), key, "inst-1", now);
        assertNotNull(c);
        assertEquals("account-1", c.account);
        assertEquals("household-1", c.tv);
        assertEquals(now + 86400, c.expiresAt);
    }

    @Test
    public void acceptsEverySignatureShape() {
        String many = json.substring(json.indexOf("\"manyValid\""));
        java.util.regex.Matcher m = java.util.regex.Pattern.compile("\"(ey[^\"]+)\"").matcher(many);
        int n = 0;
        while (m.find()) {
            assertNotNull("pass " + n, Lease.verify(m.group(1), key, "inst-1", now));
            n++;
        }
        assertEquals(64, n);
    }

    @Test
    public void refusesEverythingElse() {
        for (String name : new String[] {"expired", "otherInstance", "tampered", "otherKey", "wrongType", "wrongIssuer", "notFull", "garbage"}) {
            assertNull(name, Lease.verify(field(name), key, "inst-1", now));
        }
    }

    @Test
    public void refusesAValidPassOnceItHasExpired() {
        assertNull(Lease.verify(field("valid"), key, "inst-1", now + 86400));
        assertNotNull(Lease.verify(field("valid"), key, "inst-1", now + 86399));
    }

    @Test
    public void refusesAPassForAnotherInstall() {
        assertNull(Lease.verify(field("valid"), key, "inst-2", now));
    }

    @Test
    public void neverThrowsOnNonsense() {
        assertNull(Lease.verify(null, key, "inst-1", now));
        assertNull(Lease.verify("", key, "inst-1", now));
        assertNull(Lease.verify("a.b.c", key, "inst-1", now));
        assertNull(Lease.verify("!!!.@@@.###", key, "inst-1", now));
        assertNull(Lease.verify(field("valid"), null, "inst-1", now));
    }

    @Test
    public void readsFlatJson() {
        Map<String, Object> m = Lease.FlatJson.parse("{\"a\":\"x\\\"y\\u00e9\",\"n\":42,\"t\":true,\"z\":null,\"f\":1.5}");
        assertEquals("x\"yé", m.get("a"));
        assertEquals(42L, m.get("n"));
        assertEquals(Boolean.TRUE, m.get("t"));
        assertTrue(m.containsKey("z"));
        assertEquals(1.5, (Double) m.get("f"), 0);
    }

    @Test
    public void encodesSignaturesAsDer() {
        byte[] raw = new byte[64];
        raw[0] = (byte) 0x80; // high bit: needs a leading zero byte
        raw[63] = 1; // s is 1 with leading zeros: one byte
        byte[] der = Lease.der(raw);
        assertEquals(0x30, der[0]);
        assertEquals(0x02, der[2]);
        assertEquals(33, der[3]);
        assertEquals(0, der[4]);
        assertEquals((byte) 0x80, der[5]);
        assertEquals(0x02, der[37]);
        assertEquals(1, der[38]);
        assertEquals(1, der[39]);
    }
}
