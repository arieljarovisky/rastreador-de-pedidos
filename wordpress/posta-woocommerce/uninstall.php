<?php
/**
 * Limpieza al desinstalar el plugin.
 *
 * @package Posta_WooCommerce
 */

defined( 'WP_UNINSTALL_PLUGIN' ) || exit;

global $wpdb;

delete_option( 'posta_wc_settings' );
delete_option( 'posta_wc_connection' );

// Revocar claves REST creadas por Posta.
$table = $wpdb->prefix . 'woocommerce_api_keys';
// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching
$exists = $wpdb->get_var( $wpdb->prepare( 'SHOW TABLES LIKE %s', $table ) );
if ( $exists === $table ) {
	// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching
	$wpdb->delete(
		$table,
		array( 'description' => 'Posta — sync de pedidos' ),
		array( '%s' )
	);
}
