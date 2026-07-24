<?php
/**
 * Orquesta login Posta + API keys + connect/disconnect.
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
	 * Settings persistidos (api_url).
	 *
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
	 * Estado de conexión local.
	 *
	 * @return array
	 */
	public static function get_connection() {
		$defaults = array(
			'connected'       => false,
			'token'           => '',
			'posta_user_id'   => '',
			'posta_username'  => '',
			'posta_name'      => '',
			'account_label'   => '',
			'store_url'       => '',
			'api_key_id'      => 0,
			'connected_at'    => '',
			'last_error'      => '',
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
	 * URL pública HTTPS de la tienda.
	 *
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
	 * Conecta la tienda con una cuenta Posta (rol vendedor).
	 *
	 * @param string $username Usuario/email Posta.
	 * @param string $password Contraseña.
	 * @param string $api_url  API opcional (override).
	 * @return true|WP_Error
	 */
	public static function connect( $username, $password, $api_url = '' ) {
		$username = sanitize_text_field( wp_unslash( $username ) );
		$password = (string) $password;

		if ( '' === $username || '' === $password ) {
			return new WP_Error( 'posta_credentials', __( 'Completá usuario y contraseña de Posta.', 'posta-woocommerce' ) );
		}

		if ( $api_url ) {
			self::save_settings( array( 'api_url' => $api_url ) );
		}

		$settings  = self::get_settings();
		$store_url = self::resolve_store_url();
		if ( is_wp_error( $store_url ) ) {
			return $store_url;
		}

		$client = new Posta_WC_Api_Client( $settings['api_url'] );
		$login  = $client->login( $username, $password );

		if ( is_wp_error( $login ) ) {
			return $login;
		}

		$token = isset( $login['token'] ) ? (string) $login['token'] : '';
		$user  = isset( $login['user'] ) && is_array( $login['user'] ) ? $login['user'] : array();

		if ( '' === $token ) {
			return new WP_Error( 'posta_login', __( 'Posta no devolvió un token de sesión.', 'posta-woocommerce' ) );
		}

		$role = isset( $user['role'] ) ? (string) $user['role'] : '';
		if ( 'store_admin' !== $role ) {
			return new WP_Error(
				'posta_role',
				__( 'Esta cuenta no es de vendedor. Ingresá con tu usuario de tienda en Posta.', 'posta-woocommerce' )
			);
		}

		$keys = Posta_WC_Api_Keys::create( get_current_user_id() );
		if ( is_wp_error( $keys ) ) {
			return $keys;
		}

		$authed = new Posta_WC_Api_Client( $settings['api_url'], $token );
		$result = $authed->connect_woocommerce(
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
			$label = wp_parse_url( $store_url, PHP_URL_HOST );
		}

		self::save_connection(
			array(
				'connected'      => true,
				'token'          => $token,
				'posta_user_id'  => isset( $user['id'] ) ? (string) $user['id'] : '',
				'posta_username' => isset( $user['username'] ) ? (string) $user['username'] : $username,
				'posta_name'     => isset( $user['name'] ) ? (string) $user['name'] : '',
				'account_label'  => $label,
				'store_url'      => $store_url,
				'api_key_id'     => (int) $keys['key_id'],
				'connected_at'   => gmdate( 'c' ),
				'last_error'     => '',
			)
		);

		return true;
	}

	/**
	 * Desconecta en Posta y revoca la API key local.
	 *
	 * @return true|WP_Error
	 */
	public static function disconnect() {
		$connection = self::get_connection();
		$settings   = self::get_settings();
		$remote_ok  = true;
		$error      = null;

		if ( ! empty( $connection['token'] ) ) {
			$client = new Posta_WC_Api_Client( $settings['api_url'], $connection['token'] );
			$result = $client->disconnect_woocommerce();
			if ( is_wp_error( $result ) ) {
				// Si ya no existe (404) o el token no vale (401), seguimos limpiando local.
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
				'connected'      => false,
				'token'          => '',
				'posta_user_id'  => '',
				'posta_username' => '',
				'posta_name'     => '',
				'account_label'  => '',
				'store_url'      => '',
				'api_key_id'     => 0,
				'connected_at'   => '',
				'last_error'     => $remote_ok ? '' : ( $error ? $error->get_error_message() : '' ),
			)
		);

		if ( ! $remote_ok && $error ) {
			return new WP_Error(
				'posta_disconnect_partial',
				sprintf(
					/* translators: %s: error */
					__( 'Se limpió la conexión local, pero Posta respondió: %s. Revisá Integraciones en el panel de Posta.', 'posta-woocommerce' ),
					$error->get_error_message()
				)
			);
		}

		return true;
	}

	/**
	 * Consulta estado remoto (si hay token).
	 *
	 * @return array|WP_Error|null null si no hay conexión local.
	 */
	public static function refresh_remote_status() {
		$connection = self::get_connection();
		if ( empty( $connection['connected'] ) || empty( $connection['token'] ) ) {
			return null;
		}

		$settings = self::get_settings();
		$client   = new Posta_WC_Api_Client( $settings['api_url'], $connection['token'] );
		$status   = $client->get_integrations_status();

		if ( is_wp_error( $status ) ) {
			return $status;
		}

		$woo = isset( $status['woocommerce'] ) && is_array( $status['woocommerce'] ) ? $status['woocommerce'] : array();
		if ( empty( $woo['connected'] ) ) {
			self::save_connection(
				array(
					'connected'  => false,
					'token'      => '',
					'last_error' => __( 'La integración ya no figura conectada en Posta.', 'posta-woocommerce' ),
				)
			);
		}

		return $woo;
	}
}
