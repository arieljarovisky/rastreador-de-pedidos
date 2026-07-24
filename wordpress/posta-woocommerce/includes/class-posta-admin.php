<?php
/**
 * Pantalla de administración.
 *
 * @package Posta_WooCommerce
 */

defined( 'ABSPATH' ) || exit;

/**
 * Admin UI.
 */
class Posta_WC_Admin {

	const PAGE_SLUG = 'posta-woocommerce';

	/**
	 * Register hooks.
	 */
	public function hooks() {
		add_action( 'admin_menu', array( $this, 'register_menu' ), 56 );
		add_action( 'admin_init', array( $this, 'handle_actions' ) );
		add_action( 'admin_enqueue_scripts', array( $this, 'enqueue_assets' ) );
		add_filter( 'plugin_action_links_' . plugin_basename( POSTA_WC_PLUGIN_FILE ), array( $this, 'action_links' ) );
	}

	/**
	 * Menú bajo WooCommerce.
	 */
	public function register_menu() {
		add_submenu_page(
			'woocommerce',
			__( 'Posta', 'posta-woocommerce' ),
			__( 'Posta', 'posta-woocommerce' ),
			'manage_woocommerce',
			self::PAGE_SLUG,
			array( $this, 'render_page' )
		);
	}

	/**
	 * @param string $hook Current admin page hook.
	 */
	public function enqueue_assets( $hook ) {
		if ( false === strpos( $hook, self::PAGE_SLUG ) ) {
			return;
		}
		wp_enqueue_style(
			'posta-wc-admin',
			POSTA_WC_PLUGIN_URL . 'assets/css/admin.css',
			array(),
			POSTA_WC_VERSION
		);
	}

	/**
	 * @param array $links Plugin action links.
	 * @return array
	 */
	public function action_links( $links ) {
		$url = admin_url( 'admin.php?page=' . self::PAGE_SLUG );
		array_unshift(
			$links,
			'<a href="' . esc_url( $url ) . '">' . esc_html__( 'Conectar', 'posta-woocommerce' ) . '</a>'
		);
		return $links;
	}

	/**
	 * Procesa connect / disconnect / save settings.
	 */
	public function handle_actions() {
		if ( ! current_user_can( 'manage_woocommerce' ) ) {
			return;
		}

		if ( empty( $_POST['posta_wc_action'] ) ) { // phpcs:ignore WordPress.Security.NonceVerification.Missing
			return;
		}

		$action = sanitize_key( wp_unslash( $_POST['posta_wc_action'] ) ); // phpcs:ignore WordPress.Security.NonceVerification.Missing

		if ( 'connect' === $action ) {
			check_admin_referer( 'posta_wc_connect' );

			$username = isset( $_POST['posta_username'] ) ? sanitize_text_field( wp_unslash( $_POST['posta_username'] ) ) : '';
			$password = isset( $_POST['posta_password'] ) ? (string) wp_unslash( $_POST['posta_password'] ) : ''; // phpcs:ignore WordPress.Security.ValidatedSanitizedInput.InputNotSanitized
			$api_url  = isset( $_POST['posta_api_url'] ) ? esc_url_raw( wp_unslash( $_POST['posta_api_url'] ) ) : '';

			$result = Posta_WC_Connector::connect( $username, $password, $api_url );

			if ( is_wp_error( $result ) ) {
				$this->redirect_with_notice( 'error', $result->get_error_message() );
			}

			$this->redirect_with_notice(
				'success',
				__( 'Tienda conectada con Posta. Los pedidos con envío a domicilio se sincronizarán automáticamente.', 'posta-woocommerce' )
			);
		}

		if ( 'disconnect' === $action ) {
			check_admin_referer( 'posta_wc_disconnect' );

			$result = Posta_WC_Connector::disconnect();
			if ( is_wp_error( $result ) ) {
				$this->redirect_with_notice( 'warning', $result->get_error_message() );
			}

			$this->redirect_with_notice( 'success', __( 'Posta desconectada de esta tienda.', 'posta-woocommerce' ) );
		}

		if ( 'save_settings' === $action ) {
			check_admin_referer( 'posta_wc_settings' );
			$api_url = isset( $_POST['posta_api_url'] ) ? esc_url_raw( wp_unslash( $_POST['posta_api_url'] ) ) : POSTA_WC_DEFAULT_API_URL;
			Posta_WC_Connector::save_settings( array( 'api_url' => $api_url ) );
			$this->redirect_with_notice( 'success', __( 'Ajustes guardados.', 'posta-woocommerce' ) );
		}
	}

	/**
	 * @param string $type    success|error|warning.
	 * @param string $message Notice text.
	 */
	private function redirect_with_notice( $type, $message ) {
		$url = add_query_arg(
			array(
				'page'            => self::PAGE_SLUG,
				'posta_notice'    => rawurlencode( $message ),
				'posta_notice_t'  => $type,
			),
			admin_url( 'admin.php' )
		);
		wp_safe_redirect( $url );
		exit;
	}

	/**
	 * Render settings page.
	 */
	public function render_page() {
		if ( ! current_user_can( 'manage_woocommerce' ) ) {
			return;
		}

		$settings   = Posta_WC_Connector::get_settings();
		$connection = Posta_WC_Connector::get_connection();
		$remote     = null;
		$remote_err = null;

		if ( ! empty( $connection['connected'] ) ) {
			$remote = Posta_WC_Connector::refresh_remote_status();
			if ( is_wp_error( $remote ) ) {
				$remote_err = $remote->get_error_message();
				$remote     = null;
			}
			// Releer por si refresh_remote_status marcó desconectado.
			$connection = Posta_WC_Connector::get_connection();
		}

		$this->render_flash_notice();
		?>
		<div class="wrap posta-wc-wrap">
			<header class="posta-wc-hero">
				<div class="posta-wc-brand">
					<span class="posta-wc-mark" aria-hidden="true">P</span>
					<div>
						<h1><?php esc_html_e( 'Posta', 'posta-woocommerce' ); ?></h1>
						<p><?php esc_html_e( 'Envíos a domicilio sincronizados con tu tienda WooCommerce.', 'posta-woocommerce' ); ?></p>
					</div>
				</div>
				<a class="posta-wc-link" href="https://www.enviosposta.com.ar" target="_blank" rel="noopener noreferrer">
					<?php esc_html_e( 'Ir a Posta', 'posta-woocommerce' ); ?>
				</a>
			</header>

			<?php if ( ! empty( $connection['connected'] ) ) : ?>
				<section class="posta-wc-card posta-wc-card--ok">
					<div class="posta-wc-status">
						<span class="posta-wc-dot" aria-hidden="true"></span>
						<div>
							<strong><?php esc_html_e( 'Conectado', 'posta-woocommerce' ); ?></strong>
							<p>
								<?php
								printf(
									/* translators: 1: Posta account, 2: store URL */
									esc_html__( 'Cuenta %1$s · Tienda %2$s', 'posta-woocommerce' ),
									esc_html( $connection['posta_username'] ? $connection['posta_username'] : $connection['account_label'] ),
									esc_html( $connection['store_url'] ? $connection['store_url'] : home_url( '/' ) )
								);
								?>
							</p>
							<?php if ( ! empty( $connection['connected_at'] ) ) : ?>
								<p class="posta-wc-meta">
									<?php
									$connected_ts = strtotime( $connection['connected_at'] );
									printf(
										/* translators: %s: datetime */
										esc_html__( 'Desde %s', 'posta-woocommerce' ),
										esc_html(
											$connected_ts
												? date_i18n(
													get_option( 'date_format' ) . ' ' . get_option( 'time_format' ),
													$connected_ts
												)
												: $connection['connected_at']
										)
									);
									?>
								</p>
							<?php endif; ?>
							<?php if ( is_array( $remote ) && ! empty( $remote['autoSync'] ) ) : ?>
								<p class="posta-wc-meta"><?php esc_html_e( 'Sync automático por webhook activo.', 'posta-woocommerce' ); ?></p>
							<?php endif; ?>
							<?php if ( $remote_err ) : ?>
								<p class="posta-wc-warn"><?php echo esc_html( $remote_err ); ?></p>
							<?php endif; ?>
						</div>
					</div>

					<form method="post" class="posta-wc-actions">
						<?php wp_nonce_field( 'posta_wc_disconnect' ); ?>
						<input type="hidden" name="posta_wc_action" value="disconnect" />
						<button type="submit" class="button button-secondary posta-wc-btn-danger"
							onclick="return confirm('<?php echo esc_js( __( '¿Desconectar Posta de esta tienda?', 'posta-woocommerce' ) ); ?>');">
							<?php esc_html_e( 'Desconectar', 'posta-woocommerce' ); ?>
						</button>
					</form>
				</section>

				<section class="posta-wc-card">
					<h2><?php esc_html_e( 'Cómo funciona', 'posta-woocommerce' ); ?></h2>
					<ul class="posta-wc-list">
						<li><?php esc_html_e( 'Los pedidos pagos/procesando con envío a domicilio se envían a Posta.', 'posta-woocommerce' ); ?></li>
						<li><?php esc_html_e( 'Se excluyen retiros en local / pickup.', 'posta-woocommerce' ); ?></li>
						<li><?php esc_html_e( 'Podés importar pedidos históricos desde el panel de Posta → Ajustes → Integraciones.', 'posta-woocommerce' ); ?></li>
					</ul>
				</section>
			<?php else : ?>
				<section class="posta-wc-card">
					<h2><?php esc_html_e( 'Conectar con Posta', 'posta-woocommerce' ); ?></h2>
					<p class="posta-wc-lead">
						<?php esc_html_e( 'Usá tu cuenta de vendedor en Posta. El plugin crea las claves REST y registra los webhooks por vos.', 'posta-woocommerce' ); ?>
					</p>

					<form method="post" class="posta-wc-form" autocomplete="off">
						<?php wp_nonce_field( 'posta_wc_connect' ); ?>
						<input type="hidden" name="posta_wc_action" value="connect" />

						<p>
							<label for="posta_username"><?php esc_html_e( 'Usuario o email de Posta', 'posta-woocommerce' ); ?></label>
							<input class="regular-text" type="text" id="posta_username" name="posta_username" required autocomplete="username" />
						</p>
						<p>
							<label for="posta_password"><?php esc_html_e( 'Contraseña', 'posta-woocommerce' ); ?></label>
							<input class="regular-text" type="password" id="posta_password" name="posta_password" required autocomplete="current-password" />
						</p>

						<details class="posta-wc-advanced">
							<summary><?php esc_html_e( 'Ajustes avanzados', 'posta-woocommerce' ); ?></summary>
							<p>
								<label for="posta_api_url"><?php esc_html_e( 'URL de la API de Posta', 'posta-woocommerce' ); ?></label>
								<input class="regular-text code" type="url" id="posta_api_url" name="posta_api_url"
									value="<?php echo esc_attr( $settings['api_url'] ); ?>"
									placeholder="<?php echo esc_attr( POSTA_WC_DEFAULT_API_URL ); ?>" />
							</p>
						</details>

						<p class="posta-wc-submit">
							<button type="submit" class="button button-primary button-hero">
								<?php esc_html_e( 'Conectar tienda', 'posta-woocommerce' ); ?>
							</button>
						</p>
					</form>
				</section>

				<section class="posta-wc-card posta-wc-card--muted">
					<h2><?php esc_html_e( 'Requisitos', 'posta-woocommerce' ); ?></h2>
					<ul class="posta-wc-list">
						<li><?php esc_html_e( 'WooCommerce activo y tienda en HTTPS.', 'posta-woocommerce' ); ?></li>
						<li><?php esc_html_e( 'Cuenta de vendedor (store_admin) en Posta, con email verificado.', 'posta-woocommerce' ); ?></li>
						<li><?php esc_html_e( 'Permisos de administrador de WooCommerce en WordPress.', 'posta-woocommerce' ); ?></li>
					</ul>
				</section>
			<?php endif; ?>

			<?php if ( ! empty( $connection['connected'] ) ) : ?>
				<section class="posta-wc-card posta-wc-card--muted">
					<h2><?php esc_html_e( 'Ajustes', 'posta-woocommerce' ); ?></h2>
					<form method="post" class="posta-wc-form">
						<?php wp_nonce_field( 'posta_wc_settings' ); ?>
						<input type="hidden" name="posta_wc_action" value="save_settings" />
						<p>
							<label for="posta_api_url_settings"><?php esc_html_e( 'URL de la API de Posta', 'posta-woocommerce' ); ?></label>
							<input class="regular-text code" type="url" id="posta_api_url_settings" name="posta_api_url"
								value="<?php echo esc_attr( $settings['api_url'] ); ?>" />
						</p>
						<p>
							<button type="submit" class="button"><?php esc_html_e( 'Guardar', 'posta-woocommerce' ); ?></button>
						</p>
					</form>
				</section>
			<?php endif; ?>
		</div>
		<?php
	}

	/**
	 * Flash notice from redirect query args.
	 */
	private function render_flash_notice() {
		if ( empty( $_GET['posta_notice'] ) ) { // phpcs:ignore WordPress.Security.NonceVerification.Recommended
			return;
		}

		$message = sanitize_text_field( rawurldecode( wp_unslash( $_GET['posta_notice'] ) ) ); // phpcs:ignore WordPress.Security.NonceVerification.Recommended
		$type    = isset( $_GET['posta_notice_t'] ) ? sanitize_key( wp_unslash( $_GET['posta_notice_t'] ) ) : 'success'; // phpcs:ignore WordPress.Security.NonceVerification.Recommended

		$map = array(
			'success' => 'notice-success',
			'error'   => 'notice-error',
			'warning' => 'notice-warning',
		);
		$class = isset( $map[ $type ] ) ? $map[ $type ] : 'notice-info';

		printf(
			'<div class="notice %1$s is-dismissible"><p>%2$s</p></div>',
			esc_attr( $class ),
			esc_html( $message )
		);
	}
}
