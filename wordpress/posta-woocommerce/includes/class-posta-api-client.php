<?php
/**
 * Cliente HTTP hacia la API de Posta.
 *
 * @package Posta_WooCommerce
 */

defined( 'ABSPATH' ) || exit;

/**
 * Cliente REST de Posta.
 */
class Posta_WC_Api_Client {

	/**
	 * Base URL sin slash final.
	 *
	 * @var string
	 */
	private $base_url;

	/**
	 * JWT opcional.
	 *
	 * @var string
	 */
	private $token;

	/**
	 * @param string $base_url URL del backend Posta.
	 * @param string $token    JWT (opcional).
	 */
	public function __construct( $base_url, $token = '' ) {
		$this->base_url = untrailingslashit( $base_url );
		$this->token    = (string) $token;
	}

	/**
	 * Login con usuario/contraseña de Posta.
	 *
	 * @param string $username Email o usuario.
	 * @param string $password Contraseña.
	 * @return array|WP_Error { user, token }
	 */
	public function login( $username, $password ) {
		return $this->request(
			'POST',
			'/api/auth/login',
			array(
				'username' => $username,
				'password' => $password,
			),
			false
		);
	}

	/**
	 * Estado de integraciones del vendedor.
	 *
	 * @return array|WP_Error
	 */
	public function get_integrations_status() {
		return $this->request( 'GET', '/api/integrations/status' );
	}

	/**
	 * Conecta WooCommerce en Posta.
	 *
	 * @param string $store_url        URL HTTPS de la tienda.
	 * @param string $consumer_key     ck_…
	 * @param string $consumer_secret  cs_…
	 * @return array|WP_Error
	 */
	public function connect_woocommerce( $store_url, $consumer_key, $consumer_secret ) {
		return $this->request(
			'POST',
			'/api/integrations/woocommerce/connect',
			array(
				'storeUrl'       => $store_url,
				'consumerKey'    => $consumer_key,
				'consumerSecret' => $consumer_secret,
			)
		);
	}

	/**
	 * Desconecta WooCommerce en Posta.
	 *
	 * @return true|WP_Error
	 */
	public function disconnect_woocommerce() {
		$result = $this->request( 'DELETE', '/api/integrations/woocommerce' );
		if ( is_wp_error( $result ) ) {
			return $result;
		}
		return true;
	}

	/**
	 * Request genérico.
	 *
	 * @param string     $method   HTTP method.
	 * @param string     $path     Path relativo.
	 * @param array|null $body     Body JSON.
	 * @param bool       $auth     Incluir Bearer.
	 * @return array|WP_Error
	 */
	private function request( $method, $path, $body = null, $auth = true ) {
		$url = $this->base_url . $path;

		$headers = array(
			'Accept'       => 'application/json',
			'Content-Type' => 'application/json',
		);

		if ( $auth ) {
			if ( '' === $this->token ) {
				return new WP_Error( 'posta_no_token', __( 'No hay sesión de Posta. Volvé a conectar.', 'posta-woocommerce' ) );
			}
			$headers['Authorization'] = 'Bearer ' . $this->token;
		}

		$args = array(
			'method'  => $method,
			'headers' => $headers,
			'timeout' => 45,
		);

		if ( null !== $body ) {
			$args['body'] = wp_json_encode( $body );
		}

		$response = wp_remote_request( $url, $args );

		if ( is_wp_error( $response ) ) {
			return new WP_Error(
				'posta_http',
				sprintf(
					/* translators: %s: error message */
					__( 'No se pudo contactar Posta: %s', 'posta-woocommerce' ),
					$response->get_error_message()
				)
			);
		}

		$code = (int) wp_remote_retrieve_response_code( $response );
		$raw  = wp_remote_retrieve_body( $response );
		$data = json_decode( $raw, true );

		if ( 204 === $code ) {
			return array();
		}

		if ( $code < 200 || $code >= 300 ) {
			$message = '';
			if ( is_array( $data ) && ! empty( $data['error'] ) ) {
				$message = (string) $data['error'];
			} elseif ( $raw ) {
				$message = wp_strip_all_tags( substr( $raw, 0, 200 ) );
			}
			if ( '' === $message ) {
				$message = sprintf(
					/* translators: %d: HTTP status */
					__( 'Error HTTP %d al hablar con Posta.', 'posta-woocommerce' ),
					$code
				);
			}
			return new WP_Error( 'posta_api', $message, array( 'status' => $code, 'body' => $data ) );
		}

		return is_array( $data ) ? $data : array();
	}
}
