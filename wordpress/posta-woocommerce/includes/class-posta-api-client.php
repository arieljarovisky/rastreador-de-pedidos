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
	 * @var string
	 */
	private $base_url;

	/**
	 * Token del plugin (para desconectar).
	 *
	 * @var string
	 */
	private $token;

	/**
	 * @param string $base_url URL del backend Posta.
	 * @param string $token    Token del plugin (opcional).
	 */
	public function __construct( $base_url, $token = '' ) {
		$this->base_url = untrailingslashit( $base_url );
		$this->token    = (string) $token;
	}

	/**
	 * Conecta con código de emparejamiento (sin login en WP).
	 *
	 * @param string $code            Código Posta.
	 * @param string $store_url       URL HTTPS tienda.
	 * @param string $consumer_key    ck_…
	 * @param string $consumer_secret cs_…
	 * @return array|WP_Error
	 */
	public function plugin_connect( $code, $store_url, $consumer_key, $consumer_secret ) {
		return $this->request(
			'POST',
			'/api/integrations/woocommerce/plugin-connect',
			array(
				'code'           => $code,
				'storeUrl'       => $store_url,
				'consumerKey'    => $consumer_key,
				'consumerSecret' => $consumer_secret,
			),
			false
		);
	}

	/**
	 * Desconecta con token del plugin.
	 *
	 * @return true|WP_Error
	 */
	public function plugin_disconnect() {
		$result = $this->request( 'DELETE', '/api/integrations/woocommerce/plugin', null, true );
		if ( is_wp_error( $result ) ) {
			return $result;
		}
		return true;
	}

	/**
	 * @param string     $method HTTP method.
	 * @param string     $path   Path.
	 * @param array|null $body   JSON body.
	 * @param bool       $auth   Bearer plugin token.
	 * @return array|WP_Error
	 */
	private function request( $method, $path, $body = null, $auth = false ) {
		$url = $this->base_url . $path;

		$headers = array(
			'Accept'       => 'application/json',
			'Content-Type' => 'application/json',
		);

		if ( $auth ) {
			if ( '' === $this->token ) {
				return new WP_Error( 'posta_no_token', __( 'No hay sesión del plugin. Volvé a conectar.', 'posta-woocommerce' ) );
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
