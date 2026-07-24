<?php
/**
 * Orquesta pairing code + API keys + connect/disconnect.
 *
 * @package Posta_WooCommerce
 */

defined( 'ABSPATH' ) || exit;

/**
 * Conector Posta ↔ WooCommerce.
 */
class Posta_WC_Connector {

	const OPTION_SETTINGS = 'posta_wc_settings';
	const OPTION_STATE    = 'posta_wc_connection';

	/**
	 * @return array
	 */
	public static function get_settings() {
		$defaults = array(
			'api_url' => POSTA_WC_DEFAULT_API_URL,
		);
		$stored = get_option( self::OPTION_SETTINGS, array() );
		if ( ! is_array( $stored ) ) {
			$stored = array();
		}
		return wp_parse_args( $stored, $defaults );
	}

	/**
	 * @return array
	 */
	public static function get_connection() {
		$defaults = array(
			'connected'      => false,
			'plugin_token'   => '',
			'account_label'  => '',
			'store_url'      => '',
			'api_key_id'     => 0,
			'connected_at'   => '',
			'last_error'     => '',
		);
		$stored = get_option( self::OPTION_STATE, array() );
		if ( ! is_array( $stored ) ) {
			$stored = array();
		}
		return wp_parse_args( $stored, $defaults );
	}

	/**
	 * @param array $settings Settings.
	 */
	public static function save_settings( array $settings ) {
		$current = self::get_settings();
		$merged  = array_merge( $current, $settings );
		if ( ! empty( $merged['api_url'] ) ) {
			$merged['api_url'] = untrailingslashit( esc_url_raw( $merged['api_url'] ) );
		}
		update_option( self::OPTION_SETTINGS, $merged, false );
	}

	/**
	 * @param array $state Connection state.
	 */
	public static function save_connection( array $state ) {
		$current = self::get_connection();
		update_option( self::OPTION_STATE, array_merge( $current, $state ), false );
	}

	/**
	 * @return string|WP_Error
	 */
	public static function resolve_store_url() {
		$url = home_url( '/', 'https' );
		$url = untrailingslashit( $url );

		if ( 0 !== strpos( $url, 'https://' ) ) {
			return new WP_Error(
				'posta_https',
				__( 'La tienda debe estar en HTTPS para conectar con Posta.', 'posta-woocommerce' )
			);
		}

		return $url;
	}

	/**
	 * Conecta con un código de emparejamiento generado en Posta.
	 *
	 * @param string $pairing_code Código XXXX-XXXX.
	 * @param string $api_url      API opcional.
	 * @return true|WP_Error
	 */
	public static function connect_with_code( $pairing_code, $api_url = '' ) {
		$pairing_code = sanitize_text_field( wp_unslash( $pairing_code ) );

		if ( '' === $pairing_code ) {
			return new WP_Error( 'posta_code', __( 'Pegá el código que generaste en Posta.', 'posta-woocommerce' ) );
		}

		if ( $api_url ) {
			self::save_settings( array( 'api_url' => $api_url ) );
		}

		$settings  = self::get_settings();
		$store_url = self::resolve_store_url();
		if ( is_wp_error( $store_url ) ) {
			return $store_url;
		}

		$keys = Posta_WC_Api_Keys::create( get_current_user_id() );
		if ( is_wp_error( $keys ) ) {
			return $keys;
		}

		$client = new Posta_WC_Api_Client( $settings['api_url'] );
		$result = $client->plugin_connect(
			$pairing_code,
			$store_url,
			$keys['consumer_key'],
			$keys['consumer_secret']
		);

		if ( is_wp_error( $result ) ) {
			Posta_WC_Api_Keys::revoke( $keys['key_id'] );
			return $result;
		}

		$account = isset( $result['account'] ) && is_array( $result['account'] ) ? $result['account'] : array();
		$label   = '';
		if ( ! empty( $account['nickname'] ) ) {
			$label = (string) $account['nickname'];
		} elseif ( ! empty( $account['externalStoreId'] ) ) {
			$label = (string) $account['externalStoreId'];
		} else {
			$label = (string) wp_parse_url( $store_url, PHP_URL_HOST );
		}

		$plugin_token = isset( $result['pluginToken'] ) ? (string) $result['pluginToken'] : '';

		self::save_connection(
			array(
				'connected'     => true,
				'plugin_token'  => $plugin_token,
				'account_label' => $label,
				'store_url'     => $store_url,
				'api_key_id'    => (int) $keys['key_id'],
				'connected_at'  => gmdate( 'c' ),
				'last_error'    => '',
			)
		);

		return true;
	}

	/**
	 * @return true|WP_Error
	 */
	public static function disconnect() {
		$connection = self::get_connection();
		$settings   = self::get_settings();
		$remote_ok  = true;
		$error      = null;

		if ( ! empty( $connection['plugin_token'] ) ) {
			$client = new Posta_WC_Api_Client( $settings['api_url'], $connection['plugin_token'] );
			$result = $client->plugin_disconnect();
			if ( is_wp_error( $result ) ) {
				$data   = $result->get_error_data();
				$status = ( is_array( $data ) && isset( $data['status'] ) ) ? (int) $data['status'] : 0;
				if ( ! in_array( $status, array( 401, 404 ), true ) ) {
					$remote_ok = false;
					$error     = $result;
				}
			}
		}

		if ( ! empty( $connection['api_key_id'] ) ) {
			Posta_WC_Api_Keys::revoke( (int) $connection['api_key_id'] );
		} else {
			Posta_WC_Api_Keys::revoke_by_description( get_current_user_id() );
		}

		self::save_connection(
			array(
				'connected'     => false,
				'plugin_token'  => '',
				'account_label' => '',
				'store_url'     => '',
				'api_key_id'    => 0,
				'connected_at'  => '',
				'last_error'    => $remote_ok ? '' : ( $error ? $error->get_error_message() : '' ),
			)
		);

		if ( ! $remote_ok && $error ) {
			return new WP_Error(
				'posta_disconnect_partial',
				sprintf(
					/* translators: %s: error */
					__( 'Se limpió la conexión local, pero Posta respondió: %s. Revisá Integraciones en Posta.', 'posta-woocommerce' ),
					$error->get_error_message()
				)
			);
		}

		return true;
	}
}
