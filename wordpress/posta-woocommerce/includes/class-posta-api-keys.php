<?php
/**
 * Creación / revocación de claves REST de WooCommerce.
 *
 * @package Posta_WooCommerce
 */

defined( 'ABSPATH' ) || exit;

/**
 * Gestiona API keys de WooCommerce para Posta.
 */
class Posta_WC_Api_Keys {

	const DESCRIPTION = 'Posta — sync de pedidos';

	/**
	 * Crea una clave read_write (necesaria para webhooks).
	 *
	 * @param int $user_id Usuario WP dueño de la clave.
	 * @return array|WP_Error { key_id, consumer_key, consumer_secret }
	 */
	public static function create( $user_id ) {
		global $wpdb;

		if ( ! function_exists( 'wc_rand_hash' ) || ! function_exists( 'wc_api_hash' ) ) {
			return new WP_Error( 'posta_wc_missing', __( 'WooCommerce no está disponible.', 'posta-woocommerce' ) );
		}

		$user_id = absint( $user_id );
		if ( $user_id <= 0 ) {
			return new WP_Error( 'posta_user', __( 'Usuario inválido para crear la API key.', 'posta-woocommerce' ) );
		}

		// Revocar claves previas de Posta del mismo usuario para no acumular basura.
		self::revoke_by_description( $user_id );

		$consumer_key    = 'ck_' . wc_rand_hash();
		$consumer_secret = 'cs_' . wc_rand_hash();

		$inserted = $wpdb->insert(
			$wpdb->prefix . 'woocommerce_api_keys',
			array(
				'user_id'         => $user_id,
				'description'     => self::DESCRIPTION,
				'permissions'     => 'read_write',
				'consumer_key'    => wc_api_hash( $consumer_key ),
				'consumer_secret' => $consumer_secret,
				'truncated'          => '',
			),
			array( '%d', '%s', '%s', '%s', '%s', '%s' )
		);

		if ( ! $inserted ) {
			return new WP_Error( 'posta_key_insert', __( 'No se pudo crear la API key de WooCommerce.', 'posta-woocommerce' ) );
		}

		return array(
			'key_id'          => (int) $wpdb->insert_id,
			'consumer_key'    => $consumer_key,
			'consumer_secret' => $consumer_secret,
		);
	}

	/**
	 * Revoca una clave por ID.
	 *
	 * @param int $key_id ID en woocommerce_api_keys.
	 * @return bool
	 */
	public static function revoke( $key_id ) {
		global $wpdb;

		$key_id = absint( $key_id );
		if ( $key_id <= 0 ) {
			return false;
		}

		$deleted = $wpdb->delete(
			$wpdb->prefix . 'woocommerce_api_keys',
			array( 'key_id' => $key_id ),
			array( '%d' )
		);

		return (bool) $deleted;
	}

	/**
	 * Revoca claves Posta de un usuario (por descripción).
	 *
	 * @param int $user_id WP user ID.
	 */
	public static function revoke_by_description( $user_id ) {
		global $wpdb;

		$user_id = absint( $user_id );
		if ( $user_id <= 0 ) {
			return;
		}

		$wpdb->delete(
			$wpdb->prefix . 'woocommerce_api_keys',
			array(
				'user_id'     => $user_id,
				'description' => self::DESCRIPTION,
			),
			array( '%d', '%s' )
		);
	}
}
