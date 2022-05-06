import { DisplayAddress } from '@cardinal/namespaces-components'
import { claimLinks, withClaimToken } from '@cardinal/token-manager'
import { TokenManagerState } from '@cardinal/token-manager/dist/cjs/programs/tokenManager'
import styled from '@emotion/styled'
import { BN } from '@project-serum/anchor'
import type * as splToken from '@solana/spl-token'
import { useWallet } from '@solana/wallet-adapter-react'
import { Connection, PublicKey, Transaction } from '@solana/web3.js'
import type { TokenData } from 'api/api'
import { getTokenData } from 'api/api'
import { getATokenAccountInfo, tryPublicKey } from 'api/utils'
import { withWrapSol } from 'api/wrappedSol'
import { Header } from 'common/Header'
import { LoadingPulseWrapped } from 'common/LoadingPulse'
import { NFT } from 'common/NFT'
import { StyledBackground } from 'common/StyledBackground'
import { Tag } from 'common/Tags'
import { executeTransaction } from 'common/Transactions'
import { pubKeyUrl } from 'common/utils'
import { asWallet } from 'common/Wallets'
import {
  getDurationText,
  getSymbolFromTokenData,
  getTokenRentalRate,
  handleCopy,
} from 'components/Browse'
import { useRouter } from 'next/router'
import { lighten, transparentize } from 'polished'
import { useEnvironmentCtx } from 'providers/EnvironmentProvider'
import {
  PAYMENT_MINTS,
  usePaymentMints,
  WRAPPED_SOL_MINT,
} from 'providers/PaymentMintsProvider'
import { getLink, useProjectConfig } from 'providers/ProjectConfigProvider'
import type { ReactElement } from 'react'
import React, { useEffect, useState } from 'react'
import { FaLink, FaQuestionCircle } from 'react-icons/fa'
import { AsyncButton } from 'rental-components/common/Button'
import { useRentalRateModal } from 'rental-components/RentalRateModalProvider'

type Hideable = {
  visible?: boolean
}

enum VerificationStatus {
  WARNING,
  ERROR,
  SUCCESS,
}

interface Verifiable extends Hideable {
  status?: VerificationStatus
  scanning?: boolean
  colors?: { main: string; secondary: string }
}

const VerificationStep = styled.div<Verifiable>`
  text-align: center;
  transition: height 0.3s;
  height: ${(props) => (props.visible ? '550px' : '0px')};
  border-radius: 10px;
  margin: 0px auto;
  width: 93%;
  max-width: 500px;
  box-shadow: ${(props) => {
    if (props.visible) {
      switch (props.status) {
        case VerificationStatus.WARNING:
          return '0 0 80px 50px rgba(255, 255, 255, 0.3)'
        case VerificationStatus.ERROR:
          return '0 0 30px 20px rgba(255, 0, 50, 0.3)'
        default:
          return `0 0 80px 50px ${
            props.colors?.secondary
              ? transparentize(0.5, props.colors.secondary)
              : 'rgba(255, 255, 255, 0.3)'
          }`
      }
    }
  }};
  color: white;
  position: relative;
  overflow: ${(props) => (props.visible ? 'none' : 'hidden')};

  .header {
    position: relative;
    padding: 15px 28px 0px 28px;
    z-index: 1;
  }

  .step-name {
    font-size: 28px;
    font-weight: 400;
  }

  .address {
    text-decoration: none;
    color: white;
    width: 100%;
    overflow-wrap: break-word;
    transition: 0.2s all;

    &:hover {
      cursor: pointer;
      text-shadow: 0 0 10px #fff;
    }
  }

  .addresses {
    width: 100%;
    max-height: 65px;
    overflow: scroll;
    overflow-wrap: break-word;
  }

  .footer {
    margin-top: 20px;
    display: flex;
    justify-content: center;
  }

  .share-icon {
    font-size: 20px;
    padding: 10px;
    background: rgba(255, 255, 255, 0.4);
    cursor: pointer;
    transition: transform 0.2s;
    height: 50px;
    width: 50px;
    display: flex;
    margin: 20px auto 0px auto;
    border-radius: 50%;
    align-items: center;
    justify-content: center;

    &:hover {
      transform: scale(1.05);
    }
  }

  .claim-icon {
    font-size: 20px;
    padding: 10px;
    background: rgba(255, 255, 255, 0.4);
    cursor: pointer;
    transition: transform 0.2s;
    height: 60px;
    width: 60px;
    display: flex;
    margin: 0px auto;
    border-radius: 50%;
    align-items: center;
    justify-content: center;

    &:hover {
      transform: scale(1.05);
    }
  }

  .overlay {
    top: 0;
    transition: 0.5s opacity;
    opacity: ${(props) => (props.scanning ? 1 : 0)};
    position: absolute;
    width: 100%;
    height: 100%;
    background: rgba(200, 200, 200, 0.15);
    border-radius: 10px;
    z-index: ${(props) => (props.scanning ? 2 : 0)};

    .scan-line {
      position: absolute;
      left: 0;
      height: 100%;
      width: 10px;
      background: rgba(255, 255, 255, 0.4);
      box-shadow: 0 0 5px 5px rgba(255, 255, 255, 0.4);
      -webkit-animation: scan 1.5s linear infinite;
      -moz-animation: scan 1.5s linear infinite;
      -o-animation: scan 1.5s linear infinite;
      animation: scan 1.5s linear infinite;
    }

    @keyframes scan {
      0% {
        left: 0;
      }
      50% {
        left: 100%;
      }
      100% {
        left: 0;
      }
    }
  }

  .content {
    position: absolute;
    top: 55%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 80%;
    &:after {
      content: '';
      display: block;
      padding-bottom: 100%;
    }

    .asset {
      position: relative;
      display: inline-block;
      max-width: 90%;
      min-width: 250px;
      min-height: 250px;
      img {
        width: 100%;
        max-height: 300px;
        border-radius: 10px;
      }
    }
  }

  &:after {
    content: '';
    position: absolute;
    top: -110%;
    left: -210%;
    width: 200%;
    height: 200%;
    opacity: 0;
    transform: rotate(30deg);

    background: rgba(255, 255, 255, 0.13);
    background: linear-gradient(
      to right,
      rgba(255, 255, 255, 0.13) 0%,
      rgba(255, 255, 255, 0.13) 77%,
      rgba(255, 255, 255, 0.5) 92%,
      rgba(255, 255, 255, 0) 100%
    );

    &:hover {
      opacity: 1;
      top: -30%;
      left: -30%;
      transition-property: left, top, opacity;
      transition-duration: 0.7s, 0.7s, 0.15s;
      transition-timing-function: ease;
    }
  }
`

const NFTOuter = styled.div`
  width: fit-content;
  margin: 0px auto;
  position: relative;
  border-radius: 10px;

  .media {
    border-radius: 10px;
    max-height: 300px;
  }
`

function Claim() {
  const { config } = useProjectConfig()
  const router = useRouter()
  const ctx = useEnvironmentCtx()
  const wallet = useWallet()
  const rentalRateModal = useRentalRateModal()
  const [error, setError] = useState<ReactElement | null>(null)
  const [loadingClaim, setLoadingClaim] = useState(false)
  const { paymentMintInfos } = usePaymentMints()

  const [loadingImage, setLoadingImage] = useState(false)
  const [claimed, setClaimed] = useState(false)

  const [tokenData, setTokenData] = useState<TokenData | null>(null)
  const [tokenDataError, setTokenDataError] = useState<string | null>(null)
  const [tokenDataStatus, setTokenDataStatus] = useState<{
    status: VerificationStatus
    data?: TokenData
  } | null>(null)

  const [userPaymentTokenAccount, setUserPaymentTokenAccount] =
    useState<splToken.AccountInfo | null>(null)
  const [paymentTokenAccountError, setPaymentTokenAccountError] = useState<
    boolean | null
  >(null)

  const { tokenManagerString } = router.query
  const tokenManagerId = tryPublicKey(tokenManagerString)

  async function getMetadata() {
    try {
      setTokenDataError(null)
      setTokenData(null)
      const data = await getTokenData(ctx.connection, tokenManagerId!)
      if (
        !data.metadata &&
        !data.metaplexData &&
        !data.tokenAccount &&
        !data.tokenManager
      ) {
        throw new Error('No token found')
      }
      setTokenData(data)
      if (data?.metadata?.data?.image) {
        setLoadingImage(true)
      }
      if (data?.tokenManager?.parsed?.state === TokenManagerState.Claimed) {
        setTokenDataStatus({ status: VerificationStatus.WARNING, data })
      } else {
        setTokenDataStatus({ status: VerificationStatus.SUCCESS, data })
      }
    } catch (e: any) {
      setTokenDataError(e.toString())
      setTokenDataStatus({ status: VerificationStatus.ERROR })
    }
  }

  async function getUserPaymentTokenAccount() {
    if (wallet.publicKey && tokenData?.claimApprover?.parsed.paymentMint) {
      try {
        const userPaymentTokenAccountData = await getATokenAccountInfo(
          ctx.connection,
          tokenData?.claimApprover?.parsed.paymentMint,
          wallet.publicKey
        )
        setUserPaymentTokenAccount(userPaymentTokenAccountData)
      } catch (e) {
        console.log(e)
        if (
          tokenData?.claimApprover?.parsed.paymentMint.toString() !==
          WRAPPED_SOL_MINT
        ) {
          setPaymentTokenAccountError(true)
        }
      }
    }
  }

  useEffect(() => {
    if (tokenManagerId) {
      getMetadata()
    }
  }, [ctx.connection, tokenManagerString])

  useEffect(() => {
    getUserPaymentTokenAccount()
  }, [ctx.connection, wallet.publicKey, tokenData])

  const handleError = (e: Error) => {
    if (e.message.includes('0x1')) {
      setError(
        <div className="flex flex-col items-center justify-center">
          <div>
            Insufficient balance of{' '}
            {PAYMENT_MINTS.find(
              ({ mint }) =>
                mint.toString() ===
                tokenData?.claimApprover?.parsed.paymentMint.toString()
            )?.symbol ||
              tokenData?.claimApprover?.parsed.paymentMint.toString()}
            . Check funds and try again
          </div>
          {tokenData?.claimApprover?.parsed.paymentMint.toString() !==
            WRAPPED_SOL_MINT.toString() && (
            <a
              href={`https://app.saber.so/#/swap?from=So11111111111111111111111111111111111111112&to=${tokenData?.claimApprover?.parsed.paymentMint.toString()}`}
              target="_blank"
              rel="noreferrer"
            >
              <div>Get Funds</div>
            </a>
          )}
        </div>
      )
    } else {
      setError(<div>{`${e}`}</div>)
    }
  }

  const handleClaim = async () => {
    try {
      setError(null)
      setTokenDataStatus(null)
      setLoadingClaim(true)

      // get otp if present
      let otp
      if (router.asPath.includes('otp=')) {
        const split = router.asPath.split('/claim')
        if (split && split[1]) {
          const [_tokenManagerId, otpKeypair] = claimLinks.fromLink(
            getLink(`/claim${split[1].split('&cluster')[0]}`)
          )
          otp = otpKeypair
        }
      }

      // wrap sol if there is payment required
      const transaction = new Transaction()
      if (
        tokenData?.claimApprover?.parsed.paymentAmount &&
        tokenData?.claimApprover.parsed.paymentMint.toString() ===
          WRAPPED_SOL_MINT.toString() &&
        tokenData?.claimApprover.parsed.paymentAmount.gt(new BN(0))
      ) {
        const amountToWrap = tokenData?.claimApprover.parsed.paymentAmount.sub(
          userPaymentTokenAccount?.amount || new BN(0)
        )
        if (amountToWrap.gt(new BN(0))) {
          await withWrapSol(
            transaction,
            ctx.connection,
            asWallet(wallet),
            amountToWrap.toNumber()
          )
        }
      }
      const overrideCollection =
        ctx.environment.override && tokenData?.tokenManager?.parsed.receiptMint
          ? new Connection(ctx.environment.override)
          : ctx.connection
      await withClaimToken(
        transaction,
        overrideCollection,
        asWallet(wallet),
        tokenManagerId!,
        {
          otpKeypair: otp,
        }
      )
      await executeTransaction(ctx.connection, asWallet(wallet), transaction, {
        confirmOptions: { commitment: 'confirmed', maxRetries: 3 },
        signers: otp ? [otp] : [],
        notificationConfig: {},
      })
      setClaimed(true)
    } catch (e: any) {
      setTokenDataStatus({ status: VerificationStatus.ERROR })
      handleError(e)
    } finally {
      getMetadata()
      setLoadingClaim(false)
    }
  }

  return (
    <>
      <Header homeButton />
      <div
        style={{
          fontFamily: 'Oswald, sans-serif',
          fontWeight: '200',
          paddingTop: 'calc(50vh - 300px)',
        }}
        className="flex flex-col"
      >
        <VerificationStep
          visible={true}
          status={tokenDataStatus?.status}
          colors={config.colors}
        >
          <div className="header">
            <div className="step-name uppercase">Claim Asset</div>
            {tokenManagerId && tokenData?.tokenManager?.parsed.mint && (
              <div className="addresses">
                <a
                  className="address"
                  href={pubKeyUrl(
                    tokenData?.tokenManager?.parsed.mint,
                    ctx.environment.label
                  )}
                  target="_blank"
                  rel="noreferrer"
                >
                  {tokenData?.tokenManager?.parsed.mint.toString()}
                </a>
              </div>
            )}
          </div>
          <div className="content">
            <LoadingPulseWrapped
              loading={tokenDataStatus === null || !tokenData}
            >
              <>
                {tokenData ? (
                  <>
                    <div key={tokenData.tokenManager?.pubkey.toString()}>
                      <NFT
                        key={tokenData?.tokenManager?.pubkey.toBase58()}
                        tokenData={tokenData}
                      />
                      {
                        {
                          [TokenManagerState.Initialized]: <>Initiliazed</>,
                          [TokenManagerState.Issued]: (
                            <div
                              style={{
                                background: lighten(0.07, config.colors.main),
                              }}
                              className={`flex min-h-[82px] w-[280px] flex-col rounded-b-md p-3`}
                            >
                              <div
                                className="mb-2 flex w-full cursor-pointer flex-row text-xs font-bold text-white"
                                onClick={() =>
                                  handleCopy(
                                    getLink(
                                      `/claim/${tokenData.tokenManager?.pubkey.toBase58()}`
                                    )
                                  )
                                }
                              >
                                <p className="flex w-fit overflow-hidden text-ellipsis whitespace-nowrap text-left">
                                  {tokenData.metadata?.data?.name}
                                </p>
                                <div className="ml-[6px] mt-[2px] flex w-fit">
                                  <FaLink />
                                </div>
                              </div>

                              <div className="flex w-full flex-row justify-between text-xs">
                                {tokenData.timeInvalidator?.parsed ||
                                tokenData.useInvalidator?.parsed ? (
                                  <Tag state={TokenManagerState.Issued}>
                                    <div className="flex flex-col">
                                      <div>{getDurationText(tokenData)}</div>
                                      <DisplayAddress
                                        connection={ctx.connection}
                                        address={
                                          tokenData.tokenManager?.parsed
                                            .issuer || undefined
                                        }
                                        height="18px"
                                        width="100px"
                                        dark={true}
                                      />
                                    </div>
                                  </Tag>
                                ) : (
                                  <div className="my-auto rounded-lg bg-gray-800 px-5 py-2 text-white">
                                    Private
                                  </div>
                                )}

                                <AsyncButton
                                  bgColor={config.colors.secondary}
                                  variant="primary"
                                  disabled={!wallet.publicKey}
                                  className="my-auto inline-block flex-none text-xs"
                                  handleClick={async () => {
                                    if (wallet.publicKey) {
                                      if (
                                        tokenData.timeInvalidator?.parsed.durationSeconds?.toNumber() ===
                                        0
                                      ) {
                                        rentalRateModal.show(
                                          asWallet(wallet),
                                          ctx.connection,
                                          ctx.environment.label,
                                          tokenData
                                        )
                                      } else {
                                        await handleClaim()
                                      }
                                    }
                                  }}
                                >
                                  {tokenData.timeInvalidator?.parsed.durationSeconds?.toNumber() ===
                                  0 ? (
                                    <>
                                      {
                                        getTokenRentalRate(
                                          config,
                                          paymentMintInfos,
                                          tokenData
                                        )?.displayText
                                      }{' '}
                                    </>
                                  ) : (
                                    <>
                                      Claim{' '}
                                      {(tokenData.claimApprover?.parsed?.paymentAmount.toNumber() ??
                                        0) / 1000000000}{' '}
                                      {getSymbolFromTokenData(tokenData)}{' '}
                                    </>
                                  )}
                                </AsyncButton>
                              </div>
                            </div>
                          ),
                          [TokenManagerState.Claimed]: (
                            <div
                              style={{
                                background: lighten(0.07, config.colors.main),
                              }}
                              className={`flex min-h-[82px] w-[280px] flex-col rounded-b-md p-3`}
                            >
                              <div
                                className="mb-2 flex w-full cursor-pointer flex-row text-xs font-bold text-white"
                                onClick={() =>
                                  handleCopy(
                                    getLink(
                                      `/claim/${tokenData.tokenManager?.pubkey.toBase58()}`
                                    )
                                  )
                                }
                              >
                                <p className="flex w-fit overflow-hidden text-ellipsis whitespace-nowrap text-left">
                                  {tokenData.metadata?.data?.name}
                                </p>
                                <div className="ml-[6px] mt-[2px] flex w-fit">
                                  <span className="flex w-full text-left">
                                    <FaLink />
                                  </span>
                                </div>
                              </div>

                              <div className="flex flex-row justify-between text-xs">
                                {tokenData.recipientTokenAccount?.owner && (
                                  <Tag state={TokenManagerState.Claimed}>
                                    <div className="flex flex-col">
                                      <div className="flex">
                                        <span className="inline-block">
                                          Claimed by&nbsp;
                                        </span>
                                        <DisplayAddress
                                          style={{
                                            color: '#52c41a !important',
                                            display: 'inline',
                                          }}
                                          connection={ctx.connection}
                                          address={
                                            new PublicKey(
                                              tokenData.recipientTokenAccount?.owner
                                            )
                                          }
                                          height="18px"
                                          width="100px"
                                          dark={true}
                                        />
                                      </div>
                                      <div className="flex">
                                        <span className="inline-block">
                                          Issued by&nbsp;
                                        </span>
                                        <DisplayAddress
                                          style={{
                                            color: '#52c41a !important',
                                            display: 'inline',
                                          }}
                                          connection={ctx.connection}
                                          address={
                                            tokenData.tokenManager?.parsed
                                              .issuer
                                          }
                                          height="18px"
                                          width="100px"
                                          dark={true}
                                        />
                                      </div>
                                    </div>
                                  </Tag>
                                )}
                                {/* {((wallet.publicKey &&
                                  tokenData?.tokenManager?.parsed
                                    .invalidators &&
                                  tokenData?.tokenManager?.parsed.invalidators
                                    .map((i: PublicKey) => i.toString())
                                    .includes(wallet.publicKey?.toString())) ||
                                  (tokenData.timeInvalidator &&
                                    tokenData.timeInvalidator.parsed
                                      .expiration &&
                                    tokenData.timeInvalidator.parsed.expiration.lte(
                                      new BN(Date.now() / 1000)
                                    )) ||
                                  (tokenData.useInvalidator &&
                                    tokenData.useInvalidator.parsed.maxUsages &&
                                    tokenData.useInvalidator.parsed.usages.gte(
                                      tokenData.useInvalidator.parsed.maxUsages
                                    ))) && (
                                  <AsyncButton
                                    variant="primary"
                                    disabled={!wallet.connected}
                                    handleClick={async () => {
                                      tokenData?.tokenManager &&
                                        executeTransaction(
                                          connection,
                                          asWallet(wallet),
                                          await invalidate(
                                            connection,
                                            asWallet(wallet),
                                            tokenData?.tokenManager?.parsed.mint
                                          ),
                                          {
                                            callback: tokenManagers.refresh,
                                            silent: true,
                                          }
                                        )
                                    }}
                                  >
                                    Revoke
                                  </AsyncButton>
                                )} */}
                              </div>
                            </div>
                          ),
                          [TokenManagerState.Invalidated]: (
                            <Tag state={TokenManagerState.Invalidated}>
                              Invalidated
                            </Tag>
                          ),
                        }[
                          tokenData?.tokenManager?.parsed
                            .state as TokenManagerState
                        ]
                      }
                    </div>
                    {/* <div className="footer">
                      {(claimed && wallet.publicKey) ||
                      (tokenData.tokenManager?.parsed.state ===
                        TokenManagerState.Claimed &&
                        tokenData.recipientTokenAccount?.owner) ? (
                        <div>
                          <div>
                            Claimed by{' '}
                            <a
                              style={{ paddingLeft: '3px', color: 'blue' }}
                              href={pubKeyUrl(
                                tokenData.recipientTokenAccount?.owner ||
                                  wallet.publicKey,
                                ctx.environment.label
                              )}
                              target="_blank"
                              rel="noreferrer"
                            >
                              {shortPubKey(
                                tokenData.recipientTokenAccount?.owner ||
                                  wallet.publicKey
                              )}
                            </a>
                          </div>
                          <div>
                            This is a cardinal-powered non-transferable NFT
                          </div>
                          <Button
                            className="mx-auto mt-2"
                            variant="primary"
                            onClick={async () => {
                              router.push(
                                `/#${
                                  tokenData.recipientTokenAccount?.owner ||
                                  wallet.publicKey
                                }${
                                  ctx.environment.label === 'devnet'
                                    ? `?cluster=devnet`
                                    : ''
                                }`,
                                undefined,
                                {
                                  shallow:
                                    wallet?.publicKey?.toString() ===
                                    tokenData.recipientTokenAccount?.owner.toString(),
                                }
                              )
                            }}
                          >
                            View
                          </Button>
                        </div>
                      ) : paymentTokenAccountError ? (
                        <div>No balance of required payment</div>
                      ) : wallet.connected ? (
                        <div
                          className="claim-icon uppercase"
                          onClick={handleClaim}
                        >
                          {loadingClaim ? (
                            <div
                              style={{
                                width: '40px',
                                height: '40px',
                                position: 'relative',
                              }}
                            >
                              <LoadingPulse loading={loadingClaim} />
                            </div>
                          ) : (
                            'Claim'
                          )}
                        </div>
                      ) : (
                        <div className="uppercase">Connect wallet to claim</div>
                      )}
                    </div> */}
                  </>
                ) : (
                  <>
                    <FaQuestionCircle
                      style={{ fontSize: '170px', margin: '0px auto' }}
                    />
                    {tokenDataError && (
                      <div className="footer" style={{ marginTop: '25px' }}>
                        {`${tokenDataError}`}
                      </div>
                    )}
                  </>
                )}
              </>
            </LoadingPulseWrapped>
          </div>
        </VerificationStep>
        <div
          style={{
            width: '50%',
            margin: '40px auto',
            textAlign: 'center',
            color: 'white',
          }}
        >
          {error}
        </div>
      </div>
      <StyledBackground colors={config.colors} />
    </>
  )
}

export default Claim
