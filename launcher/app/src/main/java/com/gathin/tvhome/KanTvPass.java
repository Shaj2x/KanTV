package com.gathin.tvhome;

import android.content.Context;
import android.util.Log;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.security.interfaces.ECPublicKey;
import java.util.UUID;

/**
 * Whether this launcher may show a custom KanTV design: only while the subscription pass the phone pushed (the
 * free trial, then a subscription) is valid. Without one, Home shows the built-in look and the design stays on
 * disk, so it comes back the moment a new pass arrives. Nothing else is ever locked: apps, inputs, Settings and
 * Home always work.
 *
 * The check is on only in builds that carry the backend's public key (gradle properties kantvLeaseX and
 * kantvLeaseY); upstream-style builds and development builds without it show any pushed theme, as before.
 *
 * The phone reads this install's ID and writes the pass through ThemeProvider, the same way it pushes a theme:
 *   content read  --uri content://tv.kantv.home.theme/kantv_instance
 *   content write --uri content://tv.kantv.home.theme/kantv_lease.jws < pass
 */
final class KanTvPass {
    private static final String TAG = "KanTvPass";
    static final String INSTANCE_FILE = "kantv_instance";
    static final String LEASE_FILE = "kantv_lease.jws";

    private KanTvPass() {}

    static boolean required() {
        return !BuildConfig.KANTV_LEASE_X.isEmpty() && !BuildConfig.KANTV_LEASE_Y.isEmpty();
    }

    /** A random ID for this install, made once; a pass is bound to it so a copied pass unlocks no other TV. */
    static String instance(Context ctx) {
        File own = new File(ctx.getFilesDir(), INSTANCE_FILE);
        String id = readSmall(own);
        if (id == null || !id.matches("[0-9a-f-]{36}")) {
            id = UUID.randomUUID().toString();
            write(own, id);
        }
        // Mirrored where ThemeProvider reads, for the phone.
        File dir = Config.dir(ctx);
        if (dir != null && !id.equals(readSmall(new File(dir, INSTANCE_FILE)))) write(new File(dir, INSTANCE_FILE), id);
        return id;
    }

    /** True when a custom design may be shown now. */
    static boolean allowsCustomLook(Context ctx) {
        if (!required()) return true;
        File dir = Config.dir(ctx);
        String jws = dir != null ? readSmall(new File(dir, LEASE_FILE)) : null;
        try {
            ECPublicKey key = Lease.publicKey(BuildConfig.KANTV_LEASE_X, BuildConfig.KANTV_LEASE_Y);
            return Lease.verify(jws, key, instance(ctx), System.currentTimeMillis() / 1000) != null;
        } catch (java.security.GeneralSecurityException | IllegalArgumentException e) {
            Log.w(TAG, "pass key unusable: " + e.getMessage());
            return false;
        }
    }

    private static String readSmall(File f) {
        if (f == null || !f.isFile() || f.length() > 8192) return null;
        try {
            return new String(Files.readAllBytes(f.toPath()), StandardCharsets.UTF_8).trim();
        } catch (IOException e) {
            return null;
        }
    }

    private static void write(File f, String text) {
        try (FileOutputStream out = new FileOutputStream(f)) {
            out.write(text.getBytes(StandardCharsets.UTF_8));
        } catch (IOException e) {
            Log.w(TAG, "could not write " + f + ": " + e.getMessage());
        }
    }
}
