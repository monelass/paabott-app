import React, { useEffect, useRef } from 'react';
import {
  Dimensions,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  cancelAnimation,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { colors } from '../theme/colors';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

const NORMAL_INTRO_MS = 3100;
const NORMAL_OUTRO_MS = 350;

const QUICK_INTRO_MS = 900;
const QUICK_OUTRO_MS = 180;

const TAGLINE = 'Your needs, delivered.';

function PopLetter({
  char,
  delay,
  quick = false,
}) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withDelay(
      delay,
      withSpring(1, {
        damping: quick ? 10 : 12,
        stiffness: quick ? 220 : 180,
        mass: quick ? 0.6 : 0.8,
      })
    );
  }, [delay, progress, quick]);

  const letterStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [
      {
        translateY: (1 - progress.value) * (quick ? 14 : 25),
      },
      {
        scale: 0.5 + progress.value * 0.5,
      },
    ],
  }));

  return (
    <Animated.Text style={[styles.titleLetter, letterStyle]}>
      {char}
    </Animated.Text>
  );
}

export default function OpeningAnimation({
  onFinish,
  quick = false,
}) {
  const finishedRef = useRef(false);
  const skippingRef = useRef(false);

  const INTRO_MS = quick
    ? QUICK_INTRO_MS
    : NORMAL_INTRO_MS;

  const OUTRO_MS = quick
    ? QUICK_OUTRO_MS
    : NORMAL_OUTRO_MS;

  const packageY = useSharedValue(-SCREEN_HEIGHT * 0.55);
  const packageScale = useSharedValue(0.85);
  const packageRotate = useSharedValue(-8);

  const shadowScale = useSharedValue(0.4);
  const shadowOpacity = useSharedValue(0);

  const glowOpacity = useSharedValue(0);
  const glowScale = useSharedValue(0.6);

  const ringOpacity = useSharedValue(0);
  const ringScale = useSharedValue(0.4);

  const titleOpacity = useSharedValue(0);
  const titleY = useSharedValue(25);

  const taglineOpacity = useSharedValue(0);
  const taglineY = useSharedValue(15);

  const overlayOpacity = useSharedValue(1);
  const shake = useSharedValue(0);

  const handleDone = () => {
    if (finishedRef.current) {
      return;
    }

    finishedRef.current = true;

    if (onFinish) {
      onFinish();
    }
  };

  useEffect(() => {
    const packageFallDuration = quick ? 250 : 650;
    const packageBounceOne = quick ? 70 : 170;
    const packageBounceTwo = quick ? 80 : 190;
    const packageBounceThree = quick ? 45 : 100;
    const packageBounceFour = quick ? 55 : 120;

    const rotateDuration = quick ? 220 : 500;
    const scaleDuration = quick ? 220 : 500;

    const impactDelay = quick ? 250 : 650;
    const titleDelay = quick ? 300 : 800;
    const titleDuration = quick ? 220 : 450;

    const taglineDelay = quick ? 470 : 1450;
    const taglineDuration = quick ? 180 : 400;

    // Package falling animation
    packageY.value = withSequence(
      withTiming(0, {
        duration: packageFallDuration,
        easing: Easing.in(Easing.quad),
      }),
      withTiming(-22, {
        duration: packageBounceOne,
        easing: Easing.out(Easing.quad),
      }),
      withTiming(0, {
        duration: packageBounceTwo,
        easing: Easing.in(Easing.quad),
      }),
      withTiming(-8, {
        duration: packageBounceThree,
        easing: Easing.out(Easing.quad),
      }),
      withTiming(0, {
        duration: packageBounceFour,
        easing: Easing.out(Easing.quad),
      })
    );

    packageRotate.value = withSequence(
      withTiming(0, {
        duration: rotateDuration,
        easing: Easing.out(Easing.quad),
      }),
      withSpring(0, {
        damping: quick ? 8 : 9,
        stiffness: quick ? 210 : 160,
      })
    );

    packageScale.value = withSequence(
      withTiming(1, {
        duration: scaleDuration,
        easing: Easing.out(Easing.quad),
      }),
      withTiming(0.92, {
        duration: quick ? 55 : 100,
      }),
      withSpring(1, {
        damping: quick ? 8 : 10,
        stiffness: quick ? 220 : 180,
      })
    );

    // Ground shadow
    shadowOpacity.value = withSequence(
      withTiming(0.15, {
        duration: quick ? 120 : 350,
      }),
      withTiming(0.35, {
        duration: quick ? 130 : 300,
      })
    );

    shadowScale.value = withSequence(
      withTiming(0.8, {
        duration: quick ? 120 : 350,
      }),
      withTiming(1, {
        duration: quick ? 130 : 300,
      })
    );

    // Impact shake
    shake.value = withDelay(
      impactDelay,
      withSequence(
        withTiming(-4, {
          duration: quick ? 22 : 40,
        }),
        withTiming(4, {
          duration: quick ? 22 : 40,
        }),
        withTiming(-2, {
          duration: quick ? 22 : 40,
        }),
        withTiming(2, {
          duration: quick ? 22 : 40,
        }),
        withTiming(0, {
          duration: quick ? 22 : 40,
        })
      )
    );

    // Impact ring
    ringOpacity.value = withDelay(
      impactDelay,
      withSequence(
        withTiming(0.65, {
          duration: quick ? 35 : 60,
        }),
        withTiming(0, {
          duration: quick ? 180 : 450,
        })
      )
    );

    ringScale.value = withDelay(
      impactDelay,
      withTiming(1.7, {
        duration: quick ? 220 : 500,
        easing: Easing.out(Easing.quad),
      })
    );

    // Glow
    glowOpacity.value = withDelay(
      impactDelay,
      withSequence(
        withTiming(0.35, {
          duration: quick ? 60 : 120,
        }),
        withTiming(0, {
          duration: quick ? 180 : 450,
        })
      )
    );

    glowScale.value = withDelay(
      impactDelay,
      withSequence(
        withTiming(1, {
          duration: quick ? 70 : 150,
        }),
        withTiming(1.25, {
          duration: quick ? 170 : 400,
        })
      )
    );

    // App title
    titleOpacity.value = withDelay(
      titleDelay,
      withTiming(1, {
        duration: titleDuration,
      })
    );

    titleY.value = withDelay(
      titleDelay,
      withTiming(0, {
        duration: titleDuration,
        easing: Easing.out(Easing.cubic),
      })
    );

    // Tagline
    taglineOpacity.value = withDelay(
      taglineDelay,
      withTiming(1, {
        duration: taglineDuration,
      })
    );

    taglineY.value = withDelay(
      taglineDelay,
      withTiming(0, {
        duration: taglineDuration,
        easing: Easing.out(Easing.cubic),
      })
    );

    // Automatically close intro
    overlayOpacity.value = withDelay(
      INTRO_MS,
      withTiming(
        0,
        {
          duration: OUTRO_MS,
          easing: Easing.in(Easing.quad),
        },
        (finished) => {
          if (finished) {
            runOnJS(handleDone)();
          }
        }
      )
    );

    return () => {
      cancelAnimation(packageY);
      cancelAnimation(packageScale);
      cancelAnimation(packageRotate);
      cancelAnimation(shadowScale);
      cancelAnimation(shadowOpacity);
      cancelAnimation(glowOpacity);
      cancelAnimation(glowScale);
      cancelAnimation(ringOpacity);
      cancelAnimation(ringScale);
      cancelAnimation(titleOpacity);
      cancelAnimation(titleY);
      cancelAnimation(taglineOpacity);
      cancelAnimation(taglineY);
      cancelAnimation(overlayOpacity);
      cancelAnimation(shake);
    };
  }, [
    quick,
    packageY,
    packageScale,
    packageRotate,
    shadowScale,
    shadowOpacity,
    glowOpacity,
    glowScale,
    ringOpacity,
    ringScale,
    titleOpacity,
    titleY,
    taglineOpacity,
    taglineY,
    overlayOpacity,
    shake,
  ]);

  const skip = () => {
    if (
      skippingRef.current ||
      finishedRef.current
    ) {
      return;
    }

    skippingRef.current = true;

    cancelAnimation(packageY);
    cancelAnimation(packageScale);
    cancelAnimation(packageRotate);
    cancelAnimation(shadowScale);
    cancelAnimation(shadowOpacity);
    cancelAnimation(glowOpacity);
    cancelAnimation(glowScale);
    cancelAnimation(ringOpacity);
    cancelAnimation(ringScale);
    cancelAnimation(titleOpacity);
    cancelAnimation(titleY);
    cancelAnimation(taglineOpacity);
    cancelAnimation(taglineY);
    cancelAnimation(shake);
    cancelAnimation(overlayOpacity);

    overlayOpacity.value = withTiming(
      0,
      {
        duration: quick ? 100 : 180,
        easing: Easing.inOut(Easing.quad),
      },
      (finished) => {
        if (finished) {
          runOnJS(handleDone)();
        }
      }
    );
  };

  const overlayStyle = useAnimatedStyle(() => ({
    opacity: overlayOpacity.value,
  }));

  const sceneStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateX: shake.value,
      },
    ],
  }));

  const packageStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateY: packageY.value,
      },
      {
        rotate: `${packageRotate.value}deg`,
      },
      {
        scale: packageScale.value,
      },
    ],
  }));

  const shadowStyle = useAnimatedStyle(() => ({
    opacity: shadowOpacity.value,
    transform: [
      {
        scaleX: shadowScale.value,
      },
    ],
  }));

  const glowStyle = useAnimatedStyle(() => ({
    opacity: glowOpacity.value,
    transform: [
      {
        scale: glowScale.value,
      },
    ],
  }));

  const ringStyle = useAnimatedStyle(() => ({
    opacity: ringOpacity.value,
    transform: [
      {
        scaleX: ringScale.value,
      },
      {
        scaleY: ringScale.value * 0.4,
      },
    ],
  }));

  const titleStyle = useAnimatedStyle(() => ({
    opacity: titleOpacity.value,
    transform: [
      {
        translateY: titleY.value,
      },
    ],
  }));

  const taglineStyle = useAnimatedStyle(() => ({
    opacity: taglineOpacity.value,
    transform: [
      {
        translateY: taglineY.value,
      },
    ],
  }));

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[
        styles.overlay,
        overlayStyle,
      ]}
    >
      <LinearGradient
        colors={[
          colors.primary || '#0B8F63',
          colors.primaryDark || '#056B4A',
          '#034F38',
        ]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      {/* Background decoration */}
      <View style={styles.circleOne} />
      <View style={styles.circleTwo} />
      <View style={styles.circleThree} />

      <Pressable
        style={styles.stage}
        onPress={skip}
      >
        <Animated.View
          style={[
            styles.scene,
            sceneStyle,
          ]}
        >
          {/* Soft glow */}
          <Animated.View
            style={[
              styles.glow,
              glowStyle,
            ]}
          />

          {/* Impact ring */}
          <Animated.View
            style={[
              styles.ring,
              ringStyle,
            ]}
          />

          {/* Ground shadow */}
          <Animated.View
            style={[
              styles.shadow,
              shadowStyle,
            ]}
          />

          {/* Package */}
          <Animated.View
            style={[
              styles.packageWrapper,
              packageStyle,
            ]}
          >
            <View style={styles.package}>
              <View style={styles.packageTop}>
                <View style={styles.tapeVertical} />
                <View style={styles.tapeHorizontal} />
              </View>

              <View style={styles.packageBody}>
                <View style={styles.packageLine} />
                <View style={styles.packageLineShort} />

                <View style={styles.deliveryLabel}>
                  <Text style={styles.labelText}>
                    PAABOT
                  </Text>

                  <View style={styles.barcode}>
                    <View style={styles.barOne} />
                    <View style={styles.barTwo} />
                    <View style={styles.barThree} />
                    <View style={styles.barFour} />
                  </View>
                </View>
              </View>
            </View>
          </Animated.View>
        </Animated.View>

        {/* App name */}
        <Animated.View
          style={[
            styles.titleContainer,
            quick && styles.titleContainerQuick,
            titleStyle,
          ]}
        >
          <View style={styles.titleRow}>
            {'PAABOT'.split('').map(
              (char, index) => (
                <PopLetter
                  key={`${char}-${index}`}
                  char={char}
                  delay={
                    (quick ? 315 : 850) +
                    index *
                      (quick ? 32 : 65)
                  }
                  quick={quick}
                />
              )
            )}
          </View>

          <View style={styles.titleUnderline} />
        </Animated.View>

        {/* Tagline */}
        <Animated.View
          style={[
            styles.taglineContainer,
            quick &&
              styles.taglineContainerQuick,
            taglineStyle,
          ]}
        >
          <Text style={styles.taglineText}>
            {TAGLINE}
          </Text>
        </Animated.View>

        {/* Skip hint */}
        {!quick && (
          <Text style={styles.skipText}>
            Tap anywhere to skip
          </Text>
        )}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 9999,
    elevation: 24,
  },

  stage: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },

  scene: {
    alignItems: 'center',
    justifyContent: 'center',
  },

  /* Background */

  circleOne: {
    position: 'absolute',
    width: 330,
    height: 330,
    borderRadius: 165,
    backgroundColor: '#FFFFFF',
    opacity: 0.045,
    top: -130,
    right: -110,
  },

  circleTwo: {
    position: 'absolute',
    width: 240,
    height: 240,
    borderRadius: 120,
    backgroundColor: '#FFFFFF',
    opacity: 0.035,
    bottom: -80,
    left: -90,
  },

  circleThree: {
    position: 'absolute',
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#FFFFFF',
    opacity: 0.035,
    top: '25%',
    left: 25,
  },

  /* Effects */

  glow: {
    position: 'absolute',
    width: 230,
    height: 230,
    borderRadius: 115,
    backgroundColor: '#FFFFFF',
    opacity: 0,
    top: -85,
  },

  ring: {
    position: 'absolute',
    width: 160,
    height: 55,
    borderRadius: 100,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.75)',
    bottom: -15,
  },

  shadow: {
    position: 'absolute',
    width: 125,
    height: 18,
    borderRadius: 100,
    backgroundColor: '#002C20',
    bottom: -25,
  },

  /* Package */

  packageWrapper: {
    zIndex: 5,
  },

  package: {
    width: 128,
    height: 112,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: '#D99A5B',
    borderWidth: 2,
    borderColor: '#B8783E',

    shadowColor: '#000000',
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: {
      width: 0,
      height: 8,
    },

    elevation: 8,
  },

  packageTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 30,
    backgroundColor: '#C9874D',
    borderBottomWidth: 2,
    borderBottomColor: '#A96B37',
  },

  tapeVertical: {
    position: 'absolute',
    width: 22,
    top: 0,
    bottom: 0,
    left: '50%',
    marginLeft: -11,
    backgroundColor: '#EBD8AD',
    opacity: 0.95,
  },

  tapeHorizontal: {
    position: 'absolute',
    height: 4,
    left: 0,
    right: 0,
    top: 26,
    backgroundColor:
      'rgba(0,0,0,0.12)',
  },

  packageBody: {
    position: 'absolute',
    top: 42,
    left: 10,
    right: 10,
    bottom: 10,
  },

  packageLine: {
    width: 35,
    height: 4,
    borderRadius: 4,
    backgroundColor: '#B97842',
    marginBottom: 7,
  },

  packageLineShort: {
    width: 24,
    height: 4,
    borderRadius: 4,
    backgroundColor: '#B97842',
  },

  deliveryLabel: {
    position: 'absolute',
    right: 0,
    top: -2,
    width: 62,
    height: 48,
    borderRadius: 5,
    backgroundColor: '#FFFFFF',
    padding: 7,
    transform: [
      {
        rotate: '-4deg',
      },
    ],
  },

  labelText: {
    fontSize: 8,
    fontWeight: '900',
    color: '#087653',
    marginBottom: 5,
  },

  barcode: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: 15,
  },

  barOne: {
    width: 2,
    height: 14,
    backgroundColor: '#222222',
    marginRight: 2,
  },

  barTwo: {
    width: 4,
    height: 10,
    backgroundColor: '#222222',
    marginRight: 2,
  },

  barThree: {
    width: 2,
    height: 14,
    backgroundColor: '#222222',
    marginRight: 2,
  },

  barFour: {
    width: 5,
    height: 8,
    backgroundColor: '#222222',
  },

  /* Title */

  titleContainer: {
    alignItems: 'center',
    marginTop: 38,
  },

  titleContainerQuick: {
    marginTop: 26,
  },

  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },

  titleLetter: {
    fontSize: 48,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 1,
    marginHorizontal: 1,

    textShadowColor:
      'rgba(0,0,0,0.22)',
    textShadowOffset: {
      width: 0,
      height: 3,
    },
    textShadowRadius: 7,
  },

  titleUnderline: {
    width: 48,
    height: 4,
    borderRadius: 4,
    backgroundColor: '#FFFFFF',
    opacity: 0.9,
    marginTop: 9,
  },

  /* Tagline */

  taglineContainer: {
    marginTop: 18,
    paddingVertical: 9,
    paddingHorizontal: 20,
    borderRadius: 30,
    backgroundColor:
      'rgba(255,255,255,0.96)',

    shadowColor: '#000000',
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: {
      width: 0,
      height: 3,
    },

    elevation: 4,
  },

  taglineContainerQuick: {
    marginTop: 12,
    paddingVertical: 7,
    paddingHorizontal: 17,
  },

  taglineText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#087653',
    letterSpacing: 0.3,
    textAlign: 'center',
  },

  /* Skip */

  skipText: {
    position: 'absolute',
    bottom: 35,
    fontSize: 11,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.55)',
    letterSpacing: 0.5,
  },
});