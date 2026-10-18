// src/components/ShortIntro.js

import React, { useState, useRef } from 'react';

import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  FlatList,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  Image,
  Animated,
} from 'react-native';

import { Ionicons } from '@expo/vector-icons';

import intro1Img from '../assets/images/intro_1.jpg';
import intro2Img from '../assets/images/intro_2.jpg';
import intro3Img from '../assets/images/intro_3.jpg';

const { width, height } = Dimensions.get('window');

const SLIDES = [
  {
    id: '1',
    tag: 'MADE FOR BINALBAGAN',
    title: 'Welcome to Paabot',
    subtitle:
      'Your local way to order, request, and send.',
    description:
      'Paabot brings customers, local stores, and delivery riders together in one easy-to-use app.',
    image: intro1Img,
  },

  {
    id: '2',
    tag: 'SHOP & REQUEST',
    title: 'Get What You Need',
    subtitle:
      'Order from local stores or ask for something else.',
    description:
      'Browse your favorite local shops, order food and other items, or send a PasaBuy and pickup request.',
    image: intro2Img,
  },

  {
    id: '3',
    tag: 'SUPPORT LOCAL',
    title: 'Built for Our Community',
    subtitle:
      'Helping local businesses and riders move forward.',
    description:
      'Paabot gives local stores a place to reach more customers while giving riders more delivery opportunities.',
    image: intro3Img,
  },
];

export default function ShortIntro({ onFinish }) {
  const [currentIndex, setCurrentIndex] = useState(0);

  const slidesRef = useRef(null);

  const fadeAnim = useRef(
    new Animated.Value(1)
  ).current;

  const isExitingRef = useRef(false);

  const viewableItemsChanged = useRef(
    ({ viewableItems }) => {
      if (
        viewableItems &&
        viewableItems.length > 0
      ) {
        const index =
          viewableItems[0].index;

        if (
          index !== null &&
          index !== undefined
        ) {
          setCurrentIndex(index);
        }
      }
    }
  ).current;

  const viewConfig = useRef({
    viewAreaCoveragePercentThreshold: 50,
  }).current;

  const handleExit = () => {
    if (isExitingRef.current) {
      return;
    }

    isExitingRef.current = true;

    Animated.timing(fadeAnim, {
      toValue: 0,
      duration: 300,
      useNativeDriver: true,
    }).start(() => {
      if (onFinish) {
        onFinish();
      }
    });
  };

  const scrollToNext = () => {
    if (
      currentIndex <
      SLIDES.length - 1
    ) {
      slidesRef.current?.scrollToIndex({
        index: currentIndex + 1,
        animated: true,
      });
    } else {
      handleExit();
    }
  };

  const renderSlide = ({
    item,
    index,
  }) => {
    return (
      <View style={styles.slide}>
        <Image
          source={item.image}
          style={styles.backgroundImage}
          resizeMode="cover"
        />

        <View
          style={styles.backgroundTint}
        />

        <View
          style={styles.imageWrapper}
        >
          <Image
            source={item.image}
            style={styles.slideImage}
            resizeMode="cover"
          />

          <View
            style={styles.imageGradient}
          />

          <View
            style={styles.imageCounter}
          >
            <Text
              style={
                styles.imageCounterText
              }
            >
              {String(index + 1).padStart(
                2,
                '0'
              )}
            </Text>
          </View>
        </View>

        <View
          style={styles.contentBox}
        >
          <View
            style={styles.tagContainer}
          >
            <View
              style={styles.tagLine}
            />

            <Text style={styles.tagText}>
              {item.tag}
            </Text>
          </View>

          <Text
            style={styles.slideTitle}
          >
            {item.title}
          </Text>

          <Text
            style={styles.slideSubtitle}
          >
            {item.subtitle}
          </Text>

          <Text
            style={
              styles.slideDescription
            }
          >
            {item.description}
          </Text>
        </View>
      </View>
    );
  };

  return (
    <Animated.View
      style={[
        styles.container,
        {
          opacity: fadeAnim,
        },
      ]}
    >
      <SafeAreaView
        style={styles.safeArea}
      >
        <StatusBar
          barStyle="dark-content"
          backgroundColor="#F8FAFC"
        />

        <View style={styles.header}>
          <View>
            <Text
              style={styles.brandText}
            >
              Paabot
            </Text>

            <View
              style={styles.brandUnderline}
            />
          </View>

          <TouchableOpacity
            onPress={handleExit}
            activeOpacity={0.7}
            style={styles.skipButton}
          >
            <Text
              style={styles.skipText}
            >
              Skip
            </Text>

            <Ionicons
              name="close-outline"
              size={17}
              color="#6B7280"
            />
          </TouchableOpacity>
        </View>

        <FlatList
          ref={slidesRef}
          data={SLIDES}
          renderItem={renderSlide}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={
            false
          }
          bounces={false}
          style={styles.slidesList}
          contentContainerStyle={
            styles.slidesContent
          }
          keyExtractor={(item) =>
            item.id
          }
          onViewableItemsChanged={
            viewableItemsChanged
          }
          viewabilityConfig={viewConfig}
          getItemLayout={(_, index) => ({
            length: width,
            offset: width * index,
            index,
          })}
          onScrollToIndexFailed={(
            info
          ) => {
            setTimeout(() => {
              slidesRef.current?.scrollToOffset(
                {
                  offset:
                    info.index * width,
                  animated: true,
                }
              );
            }, 100);
          }}
        />

        <View style={styles.footer}>
          <View
            style={
              styles.paginationContainer
            }
          >
            {SLIDES.map(
              (_, index) => (
                <View
                  key={index}
                  style={[
                    styles.dot,
                    currentIndex === index
                      ? styles.activeDot
                      : styles.inactiveDot,
                  ]}
                />
              )
            )}
          </View>

          <Text
            style={styles.slideCounter}
          >
            {currentIndex + 1} /{' '}
            {SLIDES.length}
          </Text>

          <TouchableOpacity
            style={
              styles.nextButton
            }
            onPress={scrollToNext}
            activeOpacity={0.85}
          >
            <Text
              style={
                styles.nextButtonText
              }
            >
              {currentIndex ===
              SLIDES.length - 1
                ? 'Get Started'
                : 'Continue'}
            </Text>

            <View
              style={styles.arrowCircle}
            >
              <Ionicons
                name={
                  currentIndex ===
                  SLIDES.length - 1
                    ? 'checkmark'
                    : 'arrow-forward'
                }
                size={17}
                color="#059669"
              />
            </View>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 999,
    backgroundColor: '#F8FAFC',
  },

  safeArea: {
    flex: 1,
  },

  header: {
    height: 64,
    paddingHorizontal: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    zIndex: 10,
  },

  brandText: {
    fontSize: 21,
    fontWeight: '900',
    color: '#059669',
    letterSpacing: -0.7,
  },

  brandUnderline: {
    width: 18,
    height: 3,
    borderRadius: 5,
    backgroundColor: '#059669',
    marginTop: 2,
  },

  skipButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 4,
  },

  skipText: {
    color: '#6B7280',
    fontSize: 14,
    fontWeight: '600',
    marginRight: 2,
  },

  slidesList: {
    flex: 1,
  },

  slidesContent: {
    alignItems: 'stretch',
  },

  slide: {
    width: width,
    flex: 1,
    paddingHorizontal: 24,
    paddingBottom: 125,
    justifyContent: 'center',
  },

  backgroundImage: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: width,
    height: height,
    opacity: 0.045,
  },

  backgroundTint: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#F8FAFC',
    opacity: 0.95,
  },

  imageWrapper: {
    width: '100%',
    height: 270,
    borderRadius: 22,
    overflow: 'hidden',
    backgroundColor: '#E5E7EB',

    shadowColor: '#000000',

    shadowOffset: {
      width: 0,
      height: 8,
    },

    shadowOpacity: 0.14,
    shadowRadius: 14,

    elevation: 6,

    marginBottom: 27,
  },

  slideImage: {
    width: '100%',
    height: '100%',
  },

  imageGradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 80,
    backgroundColor:
      'rgba(0,0,0,0.08)',
  },

  imageCounter: {
    position: 'absolute',
    top: 14,
    right: 14,
    minWidth: 40,
    height: 30,
    paddingHorizontal: 10,
    borderRadius: 20,
    backgroundColor:
      'rgba(0,0,0,0.48)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  imageCounterText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
  },

  contentBox: {
    width: '100%',
    alignItems: 'flex-start',
  },

  tagContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 9,
  },

  tagLine: {
    width: 22,
    height: 3,
    borderRadius: 5,
    backgroundColor: '#059669',
    marginRight: 8,
  },

  tagText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#059669',
    letterSpacing: 1.15,
  },

  slideTitle: {
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '900',
    color: '#111827',
    letterSpacing: -0.8,
    marginBottom: 7,
  },

  slideSubtitle: {
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '700',
    color: '#374151',
    marginBottom: 12,
    maxWidth: '95%',
  },

  slideDescription: {
    fontSize: 13.5,
    lineHeight: 21,
    color: '#6B7280',
    fontWeight: '400',
    maxWidth: '96%',
  },

  footer: {
    position: 'absolute',
    bottom: 20,
    left: 24,
    right: 24,
    minHeight: 62,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    zIndex: 20,
  },

  paginationContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    width: 55,
  },

  dot: {
    height: 6,
    borderRadius: 5,
    marginRight: 5,
  },

  activeDot: {
    width: 22,
    backgroundColor: '#059669',
  },

  inactiveDot: {
    width: 6,
    backgroundColor: '#D1D5DB',
  },

  slideCounter: {
    position: 'absolute',
    left: 62,
    color: '#9CA3AF',
    fontSize: 11,
    fontWeight: '700',
  },

  nextButton: {
    height: 50,
    paddingLeft: 18,
    paddingRight: 7,
    borderRadius: 27,
    backgroundColor: '#059669',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',

    shadowColor: '#059669',

    shadowOffset: {
      width: 0,
      height: 5,
    },

    shadowOpacity: 0.22,
    shadowRadius: 8,

    elevation: 5,
  },

  nextButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
    marginRight: 10,
  },

  arrowCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
});